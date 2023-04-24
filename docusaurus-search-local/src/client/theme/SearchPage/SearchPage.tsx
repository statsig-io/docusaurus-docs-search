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
  const [goodClicked, setGoodClicked] = useState<boolean>(false);
  const [badClicked, setBadClicked] = useState<boolean>(false);
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

          <div style={{ display: "flex", alignItems: "center" }}>
            <p> Did Statbot answer your question? </p>
          </div>
          <div>
            <button
              disabled={goodClicked || badClicked}
              style={{
                marginRight: "4px",
                ...(goodClicked && { color: "green" }),
              }}
              onClick={() => {
                Statsig.logEvent("statbot_thumbs_up", 1);
                setGoodClicked(true);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M8.864.046C7.908-.193 7.02.53 6.956 1.466c-.072 1.051-.23 2.016-.428 2.59-.125.36-.479 1.013-1.04 1.639-.557.623-1.282 1.178-2.131 1.41C2.685 7.288 2 7.87 2 8.72v4.001c0 .845.682 1.464 1.448 1.545 1.07.114 1.564.415 2.068.723l.048.03c.272.165.578.348.97.484.397.136.861.217 1.466.217h3.5c.937 0 1.599-.477 1.934-1.064a1.86 1.86 0 0 0 .254-.912c0-.152-.023-.312-.077-.464.201-.263.38-.578.488-.901.11-.33.172-.762.004-1.149.069-.13.12-.269.159-.403.077-.27.113-.568.113-.857 0-.288-.036-.585-.113-.856a2.144 2.144 0 0 0-.138-.362 1.9 1.9 0 0 0 .234-1.734c-.206-.592-.682-1.1-1.2-1.272-.847-.282-1.803-.276-2.516-.211a9.84 9.84 0 0 0-.443.05 9.365 9.365 0 0 0-.062-4.509A1.38 1.38 0 0 0 9.125.111L8.864.046zM11.5 14.721H8c-.51 0-.863-.069-1.14-.164-.281-.097-.506-.228-.776-.393l-.04-.024c-.555-.339-1.198-.731-2.49-.868-.333-.036-.554-.29-.554-.55V8.72c0-.254.226-.543.62-.65 1.095-.3 1.977-.996 2.614-1.708.635-.71 1.064-1.475 1.238-1.978.243-.7.407-1.768.482-2.85.025-.362.36-.594.667-.518l.262.066c.16.04.258.143.288.255a8.34 8.34 0 0 1-.145 4.725.5.5 0 0 0 .595.644l.003-.001.014-.003.058-.014a8.908 8.908 0 0 1 1.036-.157c.663-.06 1.457-.054 2.11.164.175.058.45.3.57.65.107.308.087.67-.266 1.022l-.353.353.353.354c.043.043.105.141.154.315.048.167.075.37.075.581 0 .212-.027.414-.075.582-.05.174-.111.272-.154.315l-.353.353.353.354c.047.047.109.177.005.488a2.224 2.224 0 0 1-.505.805l-.353.353.353.354c.006.005.041.05.041.17a.866.866 0 0 1-.121.416c-.165.288-.503.56-1.066.56z" />
              </svg>
            </button>
            <button
              disabled={goodClicked || badClicked}
              style={{ ...(badClicked && { color: "red" }) }}
              onClick={() => {
                Statsig.logEvent("statbot_thumbs_down", 1);
                setBadClicked(true);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M8.864 15.674c-.956.24-1.843-.484-1.908-1.42-.072-1.05-.23-2.015-.428-2.59-.125-.36-.479-1.012-1.04-1.638-.557-.624-1.282-1.179-2.131-1.41C2.685 8.432 2 7.85 2 7V3c0-.845.682-1.464 1.448-1.546 1.07-.113 1.564-.415 2.068-.723l.048-.029c.272-.166.578-.349.97-.484C6.931.08 7.395 0 8 0h3.5c.937 0 1.599.478 1.934 1.064.164.287.254.607.254.913 0 .152-.023.312-.077.464.201.262.38.577.488.9.11.33.172.762.004 1.15.069.13.12.268.159.403.077.27.113.567.113.856 0 .289-.036.586-.113.856-.035.12-.08.244-.138.363.394.571.418 1.2.234 1.733-.206.592-.682 1.1-1.2 1.272-.847.283-1.803.276-2.516.211a9.877 9.877 0 0 1-.443-.05 9.364 9.364 0 0 1-.062 4.51c-.138.508-.55.848-1.012.964l-.261.065zM11.5 1H8c-.51 0-.863.068-1.14.163-.281.097-.506.229-.776.393l-.04.025c-.555.338-1.198.73-2.49.868-.333.035-.554.29-.554.55V7c0 .255.226.543.62.65 1.095.3 1.977.997 2.614 1.709.635.71 1.064 1.475 1.238 1.977.243.7.407 1.768.482 2.85.025.362.36.595.667.518l.262-.065c.16-.04.258-.144.288-.255a8.34 8.34 0 0 0-.145-4.726.5.5 0 0 1 .595-.643h.003l.014.004.058.013a8.912 8.912 0 0 0 1.036.157c.663.06 1.457.054 2.11-.163.175-.059.45-.301.57-.651.107-.308.087-.67-.266-1.021L12.793 7l.353-.354c.043-.042.105-.14.154-.315.048-.167.075-.37.075-.581 0-.211-.027-.414-.075-.581-.05-.174-.111-.273-.154-.315l-.353-.354.353-.354c.047-.047.109-.176.005-.488a2.224 2.224 0 0 0-.505-.804l-.353-.354.353-.354c.006-.005.041-.05.041-.17a.866.866 0 0 0-.121-.415C12.4 1.272 12.063 1 11.5 1z" />
              </svg>
            </button>
          </div>
          <div style={{ marginTop: "20px" }}>
            <p>
              {" "}
              Continue the conversation with the{" "}
              <a href="https://join.slack.com/t/statsigcommunity/shared_invite/zt-pbp005hg-VFQOutZhMw5Vu9eWvCro9g">
                Statsig team on Slack
              </a>
            </p>
          </div>
        </main>
      </div>
    </React.Fragment>
  );
}
