import React, { ReactElement, useCallback, useRef } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useHistory } from "@docusaurus/router";
import { fetchIndexes } from "./fetchIndexes";
import { SearchSourceFactory } from "../../utils/SearchSourceFactory";
import { SuggestionTemplate } from "../../utils/SuggestionTemplate.js";
import { EmptyTemplate } from "../../utils/EmptyTemplate.js";
import { SearchResult } from "../../../shared/interfaces";

// This file is auto generated while building.
import { searchResultLimits } from "../../utils/proxiedGenerated";
import "./SearchBar.css";

async function fetchAutoCompleteJS(): Promise<any> {
  const autoComplete = await import("autocomplete.js");
  autoComplete.noConflict();
  return autoComplete.default;
}

interface SearchBarProps {
  isSearchBarExpanded: boolean;
  handleSearchBarToggle: (expanded: boolean) => void;
}

export default function SearchBar({
  handleSearchBarToggle,
}: SearchBarProps): ReactElement {
  const {
    siteConfig: { baseUrl },
  } = useDocusaurusContext();
  const history = useHistory();
  const searchBarRef = useRef<HTMLInputElement>(null);
  const indexState = useRef("empty"); // empty, loaded, done
  // Should the input be focused after the index is loaded?
  const focusAfterIndexLoaded = useRef(false);

  const loadIndex = useCallback(async () => {
    if (indexState.current !== "empty") {
      // Do not load the index (again) if its already loaded or in the process of being loaded.
      return;
    }
    indexState.current = "loading";

    const [{ wrappedIndexes, zhDictionary }, autoComplete] = await Promise.all([
      fetchIndexes(baseUrl),
      fetchAutoCompleteJS(),
    ]);

    autoComplete(
      searchBarRef.current,
      {
        hint: false,
        autoselect: true,
        cssClasses: {
          root: "doc-search-bar",
        },
      },
      [
        {
          source: SearchSourceFactory(
            wrappedIndexes,
            zhDictionary,
            searchResultLimits
          ),
          templates: {
            suggestion: SuggestionTemplate,
            empty: EmptyTemplate,
          },
        },
      ]
    ).on("autocomplete:selected", function (
      event: any,
      { document }: SearchResult
    ) {
      history.push(document.u);
    });

    if (focusAfterIndexLoaded.current) {
      (searchBarRef.current as HTMLInputElement).focus();
    }
    indexState.current = "done";
  }, [baseUrl, history]);

  const onInputFocus = useCallback(() => {
    focusAfterIndexLoaded.current = true;
    loadIndex();
    handleSearchBarToggle(true);
  }, [handleSearchBarToggle, loadIndex]);

  const onInputBlur = useCallback(() => {
    handleSearchBarToggle(false);
  }, [handleSearchBarToggle]);

  const onInputMouseEnter = useCallback(() => {
    loadIndex();
  }, [loadIndex]);

  return (
    <div className="navbar__search">
      <input
        placeholder="Search"
        aria-label="Search"
        className="navbar__search-input"
        onMouseEnter={onInputMouseEnter}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        ref={searchBarRef}
      />
    </div>
  );
}
