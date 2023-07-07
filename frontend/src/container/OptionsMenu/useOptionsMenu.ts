import { RadioChangeEvent } from 'antd';
import getFromLocalstorage from 'api/browser/localstorage/get';
import setToLocalstorage from 'api/browser/localstorage/set';
import { getAggregateKeys } from 'api/queryBuilder/getAttributeKeys';
import { LOCALSTORAGE } from 'constants/localStorage';
import { QueryBuilderKeys } from 'constants/queryBuilder';
import useDebounce from 'hooks/useDebounce';
import useUrlQueryData from 'hooks/useUrlQueryData';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from 'react-query';
import { ErrorResponse, SuccessResponse } from 'types/api';
import {
	BaseAutocompleteData,
	IQueryAutocompleteResponse,
} from 'types/api/queryBuilder/queryAutocompleteResponse';
import { DataSource } from 'types/common/queryBuilder';

import { defaultOptionsQuery, URL_OPTIONS } from './constants';
import { InitialOptions, OptionsMenuConfig, OptionsQuery } from './types';
import { getOptionsFromKeys } from './utils';

interface UseOptionsMenuProps {
	dataSource: DataSource;
	aggregateOperator: string;
	initialOptions?: InitialOptions;
}

interface UseOptionsMenu {
	options: OptionsQuery;
	config: OptionsMenuConfig;
}

const useOptionsMenu = ({
	dataSource,
	aggregateOperator,
	initialOptions = {},
}: UseOptionsMenuProps): UseOptionsMenu => {
	const [searchText, setSearchText] = useState<string>('');
	const [isFocused, setIsFocused] = useState<boolean>(false);
	const debouncedSearchText = useDebounce(searchText, 300);

	const localStorageOptionsQuery = getFromLocalstorage(
		LOCALSTORAGE.LIST_OPTIONS,
	);

	const initialQueryParams = useMemo(
		() => ({
			searchText: '',
			aggregateAttribute: '',
			tagType: null,
			dataSource,
			aggregateOperator,
		}),
		[dataSource, aggregateOperator],
	);

	const {
		query: optionsQuery,
		queryData: optionsQueryData,
		redirectWithQuery: redirectWithOptionsData,
	} = useUrlQueryData<OptionsQuery>(URL_OPTIONS, defaultOptionsQuery);

	const initialQueries = useMemo(
		() =>
			initialOptions?.selectColumns?.map((column) => ({
				queryKey: column,
				queryFn: (): Promise<
					SuccessResponse<IQueryAutocompleteResponse> | ErrorResponse
				> =>
					getAggregateKeys({
						...initialQueryParams,
						searchText: column,
					}),
				enabled: !!column && !optionsQuery,
			})) || [],
		[initialOptions?.selectColumns, initialQueryParams, optionsQuery],
	);

	const initialAttributesResult = useQueries(initialQueries);

	const isFetchedInitialAttributes = useMemo(
		() => initialAttributesResult.every((result) => result.isFetched),
		[initialAttributesResult],
	);

	const initialSelectedColumns = useMemo(() => {
		if (!isFetchedInitialAttributes) return [];

		const attributesData = initialAttributesResult?.reduce(
			(acc, attributeResponse) => {
				const data = attributeResponse?.data?.payload?.attributeKeys || [];

				return [...acc, ...data];
			},
			[] as BaseAutocompleteData[],
		);

		return (
			(initialOptions.selectColumns
				?.map((column) => attributesData.find(({ key }) => key === column))
				.filter(Boolean) as BaseAutocompleteData[]) || []
		);
	}, [
		isFetchedInitialAttributes,
		initialOptions?.selectColumns,
		initialAttributesResult,
	]);

	const {
		data: searchedAttributesData,
		isFetching: isSearchedAttributesFetching,
	} = useQuery(
		[QueryBuilderKeys.GET_AGGREGATE_KEYS, debouncedSearchText, isFocused],
		async () =>
			getAggregateKeys({
				...initialQueryParams,
				searchText: debouncedSearchText,
			}),
		{
			enabled: isFocused && !!debouncedSearchText.length,
		},
	);

	const searchedAttributeKeys = useMemo(
		() => searchedAttributesData?.payload?.attributeKeys || [],
		[searchedAttributesData?.payload?.attributeKeys],
	);

	const initialOptionsQuery: OptionsQuery = useMemo(
		() => ({
			...defaultOptionsQuery,
			...initialOptions,
			selectColumns: initialOptions?.selectColumns
				? initialSelectedColumns
				: defaultOptionsQuery.selectColumns,
		}),
		[initialOptions, initialSelectedColumns],
	);

	const selectedColumnKeys = useMemo(
		() => optionsQueryData?.selectColumns?.map(({ id }) => id) || [],
		[optionsQueryData],
	);

	const optionsFromAttributeKeys = useMemo(() => {
		const filteredAttributeKeys = searchedAttributeKeys.filter(
			(item) => item.key !== 'body',
		);

		return getOptionsFromKeys(filteredAttributeKeys, selectedColumnKeys);
	}, [searchedAttributeKeys, selectedColumnKeys]);

	const handleRedirectWithOptionsData = useCallback(
		(newQueryData: OptionsQuery) => {
			redirectWithOptionsData(newQueryData);

			setToLocalstorage(LOCALSTORAGE.LIST_OPTIONS, JSON.stringify(newQueryData));
		},
		[redirectWithOptionsData],
	);

	const handleSelectColumns = useCallback(
		(value: string) => {
			const newSelectedColumnKeys = [...new Set([...selectedColumnKeys, value])];
			const newSelectedColumns = newSelectedColumnKeys.reduce((acc, key) => {
				const column = [
					...searchedAttributeKeys,
					...optionsQueryData.selectColumns,
				].find(({ id }) => id === key);

				if (!column) return acc;
				return [...acc, column];
			}, [] as BaseAutocompleteData[]);

			const optionsData: OptionsQuery = {
				...optionsQueryData,
				selectColumns: newSelectedColumns,
			};

			handleRedirectWithOptionsData(optionsData);
		},
		[
			searchedAttributeKeys,
			selectedColumnKeys,
			optionsQueryData,
			handleRedirectWithOptionsData,
		],
	);

	const handleRemoveSelectedColumn = useCallback(
		(columnKey: string) => {
			const newSelectedColumns = optionsQueryData?.selectColumns?.filter(
				({ id }) => id !== columnKey,
			);

			const optionsData: OptionsQuery = {
				...optionsQueryData,
				selectColumns: newSelectedColumns,
			};

			handleRedirectWithOptionsData(optionsData);
		},
		[optionsQueryData, handleRedirectWithOptionsData],
	);

	const handleFormatChange = useCallback(
		(event: RadioChangeEvent) => {
			const optionsData: OptionsQuery = {
				...optionsQueryData,
				format: event.target.value,
			};

			handleRedirectWithOptionsData(optionsData);
		},
		[handleRedirectWithOptionsData, optionsQueryData],
	);

	const handleMaxLinesChange = useCallback(
		(value: string | number | null) => {
			const optionsData: OptionsQuery = {
				...optionsQueryData,
				maxLines: value as number,
			};

			handleRedirectWithOptionsData(optionsData);
		},
		[handleRedirectWithOptionsData, optionsQueryData],
	);

	const handleSearchAttribute = useCallback((value: string) => {
		setSearchText(value);
	}, []);

	const handleFocus = (): void => {
		setIsFocused(true);
	};

	const handleBlur = (): void => {
		setIsFocused(false);
		setSearchText('');
	};

	const optionsMenuConfig: Required<OptionsMenuConfig> = useMemo(
		() => ({
			addColumn: {
				isFetching: isSearchedAttributesFetching,
				value: optionsQueryData?.selectColumns || defaultOptionsQuery.selectColumns,
				options: optionsFromAttributeKeys || [],
				onFocus: handleFocus,
				onBlur: handleBlur,
				onSelect: handleSelectColumns,
				onRemove: handleRemoveSelectedColumn,
				onSearch: handleSearchAttribute,
			},
			format: {
				value: optionsQueryData.format || defaultOptionsQuery.format,
				onChange: handleFormatChange,
			},
			maxLines: {
				value: optionsQueryData.maxLines || defaultOptionsQuery.maxLines,
				onChange: handleMaxLinesChange,
			},
		}),
		[
			optionsFromAttributeKeys,
			optionsQueryData?.maxLines,
			optionsQueryData?.format,
			optionsQueryData?.selectColumns,
			isSearchedAttributesFetching,
			handleSearchAttribute,
			handleSelectColumns,
			handleRemoveSelectedColumn,
			handleFormatChange,
			handleMaxLinesChange,
		],
	);

	useEffect(() => {
		if (optionsQuery || !isFetchedInitialAttributes) return;

		const nextOptionsQuery = localStorageOptionsQuery
			? JSON.parse(localStorageOptionsQuery)
			: initialOptionsQuery;

		redirectWithOptionsData(nextOptionsQuery);
	}, [
		isFetchedInitialAttributes,
		optionsQuery,
		initialOptionsQuery,
		localStorageOptionsQuery,
		redirectWithOptionsData,
	]);

	return {
		options: optionsQueryData,
		config: optionsMenuConfig,
	};
};

export default useOptionsMenu;
