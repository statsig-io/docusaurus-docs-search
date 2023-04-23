import React, { useCallback, useEffect, useMemo, useState } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import { translate } from "@docusaurus/Translate";
import { usePluralForm } from "@docusaurus/theme-common";
import { useLocation } from "@docusaurus/router";
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import axios from "axios";
import clsx from "clsx";
import { marked } from "marked";

import useSearchQuery from "../hooks/useSearchQuery";
import { fetchIndexes } from "../SearchBar/fetchIndexes";
import { SearchSourceFactory } from "../../utils/SearchSourceFactory";
import { SearchDocument, SearchResult } from "../../../shared/interfaces";
import { highlight } from "../../utils/highlight";
import { highlightStemmed } from "../../utils/highlightStemmed";
import { getStemmedPositions } from "../../utils/getStemmedPositions";
import LoadingRing from "../LoadingRing/LoadingRing";
import { concatDocumentPath } from "../../utils/concatDocumentPath";
import {
  Mark,
  searchContextByPaths,
  useAllContextsWithNoSearchContext,
} from "../../utils/proxiedGenerated";

import { Statsig, StatsigProvider, useLayer } from "statsig-react";

import styles from "./SearchPage.module.css";

const CHAT_PARAM_QUERY = "chat";

export default function SearchPage(): React.ReactElement {
  const location = useLocation();
  const params = ExecutionEnvironment.canUseDOM
    ? new URLSearchParams(location.search)
    : null;
  const chatValue = params?.get(CHAT_PARAM_QUERY) || "";

  if (chatValue && chatValue.length > 0) {
    return (
      <StatsigProvider
        sdkKey="client-oJY6hTJeduhEN2bf6fh6unHvxIk9UsjS99BlO4owh0r"
        waitForInitialization={true}
        user={{}}
      >
        <Layout>
          <ChatPageContent />
        </Layout>
      </StatsigProvider>
    );
  }

  return (
    <Layout>
      <SearchPageContent />
    </Layout>
  );
}

function SearchPageContent(): React.ReactElement {
  const {
    siteConfig: { baseUrl },
  } = useDocusaurusContext();

  const { selectMessage } = usePluralForm();
  const {
    searchValue,
    searchContext,
    searchVersion,
    updateSearchPath,
    updateSearchContext,
  } = useSearchQuery();
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const [searchSource, setSearchSource] =
    useState<
      (input: string, callback: (results: SearchResult[]) => void) => void
    >();
  const [searchResults, setSearchResults] = useState<SearchResult[]>();
  const versionUrl = `${baseUrl}${searchVersion}`;

  const pageTitle = useMemo(
    () =>
      searchQuery
        ? translate(
            {
              id: "theme.SearchPage.existingResultsTitle",
              message: 'Search results for "{query}"',
              description: "The search page title for non-empty query",
            },
            {
              query: searchQuery,
            }
          )
        : translate({
            id: "theme.SearchPage.emptyResultsTitle",
            message: "Search the documentation",
            description: "The search page title for empty query",
          }),
    [searchQuery]
  );

  useEffect(() => {
    updateSearchPath(searchQuery);

    if (searchSource) {
      if (searchQuery) {
        searchSource(searchQuery, (results) => {
          setSearchResults(results);
        });
      } else {
        setSearchResults(undefined);
      }
    }

    // `updateSearchPath` should not be in the deps,
    // otherwise will cause call stack overflow.
  }, [searchQuery, searchSource]);

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  useEffect(() => {
    if (searchValue && searchValue !== searchQuery) {
      setSearchQuery(searchValue);
    }
  }, [searchValue]);

  useEffect(() => {
    async function doFetchIndexes() {
      const { wrappedIndexes, zhDictionary } = await fetchIndexes(
        versionUrl,
        searchContext
      );
      setSearchSource(() =>
        SearchSourceFactory(wrappedIndexes, zhDictionary, 100)
      );
    }
    doFetchIndexes();
  }, [searchContext, versionUrl]);

  return (
    <React.Fragment>
      <Head>
        {/*
         We should not index search pages
          See https://github.com/facebook/docusaurus/pull/3233
        */}
        <meta property="robots" content="noindex, follow" />
        <title>{pageTitle}</title>
      </Head>

      <div className="container margin-vert--lg">
        <h1>{pageTitle}</h1>

        <div className="row">
          <div
            className={clsx("col", {
              [styles.searchQueryColumn]: Array.isArray(searchContextByPaths),
              "col--9": Array.isArray(searchContextByPaths),
              "col--12": !Array.isArray(searchContextByPaths),
            })}
          >
            <input
              type="search"
              name="q"
              className={styles.searchQueryInput}
              aria-label="Search"
              onChange={handleSearchInputChange}
              value={searchQuery}
              autoComplete="off"
              autoFocus
            />
          </div>
          {Array.isArray(searchContextByPaths) ? (
            <div
              className={clsx(
                "col",
                "col--3",
                "padding-left--none",
                styles.searchContextColumn
              )}
            >
              <select
                name="search-context"
                className={styles.searchContextInput}
                id="context-selector"
                value={searchContext}
                onChange={(e) => updateSearchContext(e.target.value)}
              >
                <option value="">
                  {useAllContextsWithNoSearchContext
                    ? translate({
                        id: "theme.SearchPage.searchContext.everywhere",
                        message: "everywhere",
                      })
                    : ""}
                </option>
                {searchContextByPaths.map((context: string) => (
                  <option key={context} value={context}>
                    {context}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {!searchSource && searchQuery && (
          <div>
            <LoadingRing />
          </div>
        )}

        {searchResults &&
          (searchResults.length > 0 ? (
            <p>
              {selectMessage(
                searchResults.length,
                translate(
                  {
                    id: "theme.SearchPage.documentsFound.plurals",
                    message: "1 document found|{count} documents found",
                    description:
                      'Pluralized label for "{count} documents found". Use as much plural forms (separated by "|") as your language support (see https://www.unicode.org/cldr/cldr-aux/charts/34/supplemental/language_plural_rules.html)',
                  },
                  { count: searchResults.length }
                )
              )}
            </p>
          ) : process.env.NODE_ENV === "production" ? (
            <p>
              {translate({
                id: "theme.SearchPage.noResultsText",
                message: "No documents were found",
                description: "The paragraph for empty search result",
              })}
            </p>
          ) : (
            <p>
              ⚠️ The search index is only available when you run docusaurus
              build!
            </p>
          ))}

        <section>
          {searchResults &&
            searchResults.map((item) => (
              <SearchResultItem key={item.document.i} searchResult={item} />
            ))}
        </section>
      </div>
    </React.Fragment>
  );
}

function SearchResultItem({
  searchResult: { document, type, page, tokens, metadata },
}: {
  searchResult: SearchResult;
}): React.ReactElement {
  const isTitle = type === 0;
  const isContent = type === 2;
  const pathItems = (
    (isTitle ? document.b : (page as SearchDocument).b) as string[]
  ).slice();
  const articleTitle = (isContent ? document.s : document.t) as string;
  if (!isTitle) {
    pathItems.push((page as SearchDocument).t);
  }
  let search = "";
  if (Mark && tokens.length > 0) {
    const params = new URLSearchParams();
    for (const token of tokens) {
      params.append("_highlight", token);
    }
    search = `?${params.toString()}`;
  }
  return (
    <article className={styles.searchResultItem}>
      <h2>
        <Link
          to={document.u + search + (document.h || "")}
          dangerouslySetInnerHTML={{
            __html: isContent
              ? highlight(articleTitle, tokens)
              : highlightStemmed(
                  articleTitle,
                  getStemmedPositions(metadata, "t"),
                  tokens,
                  100
                ),
          }}
        ></Link>
      </h2>
      {pathItems.length > 0 && (
        <p className={styles.searchResultItemPath}>
          {concatDocumentPath(pathItems)}
        </p>
      )}
      {isContent && (
        <p
          className={styles.searchResultItemSummary}
          dangerouslySetInnerHTML={{
            __html: highlightStemmed(
              document.t,
              getStemmedPositions(metadata, "t"),
              tokens,
              100
            ),
          }}
        />
      )}
    </article>
  );
}

type Message = {
  type: "apiMessage" | "userMessage";
  message: string;
  isStreaming?: boolean;
};

const LoadingDots = ({
  color = "#000",
  style = "small",
}: {
  color: string;
  style: string;
}) => {
  return (
    <span className={style == "small" ? styles.loading2 : styles.loading}>
      <span style={{ backgroundColor: color }} />
      <span style={{ backgroundColor: color }} />
      <span style={{ backgroundColor: color }} />
    </span>
  );
};

function ChatPageContent(): React.ReactElement {
  const { searchValue } = useSearchQuery();
  const [threadId, setThreadId] = useState<string>("");
  const [query, setQuery] = useState<string>(searchValue);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
  }>({
    messages: [
      {
        message:
          "Hi there, I'm Statbot, what would you like to learn about Statsig? Please note that I am an experimental feature and may not be able to answer all of your questions yet. Please verify my output before executing.",
        type: "apiMessage",
      },
    ],
  });

  const { layer: statbot_layer } = useLayer("statbot_layer");

  const { messages } = messageState;

  //handle form submission
  async function handleSubmit(e: any) {
    Statsig.logEvent("statbot_user_message", 1);

    e.preventDefault();

    setError(null);

    if (!query) {
      alert("Please input a question");
      return;
    }

    const question = query.trim();

    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: "userMessage",
          message: question,
        },
      ],
    }));

    setLoading(true);
    setQuery("");

    const ctrl = new AbortController();

    try {
      const res = await axios.post(
        "https://api.otherwill.com/v2@beta/chat/completions",
        {
          input: question,
          model: statbot_layer.get("otherwill_model", "statsig_v0.2.9"),
          model_version_id: statbot_layer.get(
            "otherwill_model_version",
            "clg9zdawj0001kw08x6q8wken"
          ),
          ...(threadId.length > 0 && { thread_id: threadId }),
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );
      if (res.data.error) {
        throw new Error(res.data.error);
      }

      setThreadId(res.data.thread_id ?? "");

      setMessageState((state) => ({
        messages: [
          ...state.messages,
          {
            type: "apiMessage",
            message: res.data.completion ?? "",
          },
        ],
      }));

      Statsig.logEvent("statbot_latency_ms", res.data.latency_ms);
      Statsig.logEvent("statbot_tokens_used", res.data.usage.total_tokens);

      setLoading(false);
      ctrl.abort();
    } catch (error) {
      setLoading(false);
      setError("An error occurred while fetching the data. Please try again.");
      console.log("error", error);
    }
  }

  const chatMessages = useMemo(() => {
    return [...messages];
  }, [messages]);

  const pageTitle = "Chat with Statbot";

  return (
    <React.Fragment>
      <Head>
        <meta property="robots" content="noindex, follow" />
        <title>{pageTitle}</title>
      </Head>

      <div className="container margin-vert--lg">
        <h1>{pageTitle}</h1>
        <main className={styles.main}>
          <div className={styles.cloud}>
            <div className={styles.messagelist}>
              {chatMessages.map((message, index) => {
                let icon;
                let className;
                if (message.type === "apiMessage") {
                  icon = (
                    <img
                      src="/img/statsiglogo.png"
                      alt="AI"
                      width="40"
                      height="40"
                      className={styles.boticon}
                    />
                  );
                  className = styles.apimessage;
                } else {
                  icon = (
                    <img
                      src="/img/usericon.png"
                      alt="Me"
                      width="30"
                      height="30"
                      className={styles.usericon}
                    />
                  );
                  // The latest message sent by the user will be animated while waiting for a response
                  className =
                    loading && index === chatMessages.length - 1
                      ? styles.usermessagewaiting
                      : styles.usermessage;
                }
                const html = marked.parse(message.message);
                return (
                  <>
                    <div key={`chatMessage-${index}`} className={className}>
                      {icon}
                      <div className={styles.markdownanswer}>
                        <div dangerouslySetInnerHTML={{ __html: html }} />
                      </div>
                    </div>
                  </>
                );
              })}
            </div>
          </div>
          <div className={styles.center}>
            <div className={styles.cloudform}>
              <form onSubmit={handleSubmit}>
                <textarea
                  disabled={loading}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter" && query) {
                      handleSubmit(e);
                    } else if (e.key == "Enter") {
                      e.preventDefault();
                    }
                  }}
                  autoFocus={false}
                  rows={1}
                  maxLength={3000}
                  id="userInput"
                  name="userInput"
                  placeholder={
                    loading
                      ? "Waiting for response..."
                      : "What is Statsig about?"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={styles.textarea}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className={styles.generatebutton}
                >
                  {loading ? (
                    <div className={styles.loadingwheel}>
                      <LoadingDots color="#000" style="small" />
                    </div>
                  ) : (
                    // Send icon SVG in input field
                    <svg
                      viewBox="0 0 20 20"
                      className={styles.svgicon}
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                    </svg>
                  )}
                </button>
              </form>
            </div>
          </div>
          {error && (
            <div className="border border-red-400 rounded-md p-4">
              <p className="text-red-500">{error}</p>
            </div>
          )}
        </main>
      </div>
    </React.Fragment>
  );
}
