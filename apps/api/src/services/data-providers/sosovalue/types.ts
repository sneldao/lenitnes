export interface SosovalueCurrency {
  currency_id: string;
  symbol: string;
  name: string;
}

export interface MarketSnapshot {
  price: number;
  change_pct_24h: number;
  turnover_24h: number;
  turnover_rate: number;
  high_24h: number;
  low_24h: number;
  marketcap: number;
  fdv: number;
  max_supply: string | null;
  total_supply: string;
  circulating_supply: string;
  ath: number;
  ath_date: string;
  down_from_ath: string;
  cycle_low: number;
  cycle_low_date: string;
  up_from_cycle_low: string;
  marketcap_rank: number;
}

export interface NewsCurrencyMatch {
  id: string;
  full_name: string;
  name: string;
}

export interface NewsItem {
  id: string;
  source_link: string;
  original_link: string;
  release_time: number;
  title: string;
  content: string;
  author: string;
  author_description: string;
  category: number;
  matched_currencies: NewsCurrencyMatch[];
  tags: string[];
  impression_count: number;
  like_count: number;
  reply_count: number;
}

export interface NewsFeedResponse {
  page: number;
  page_size: number;
  total: number;
  list: NewsItem[];
}

export interface NewsSearchResponse {
  code: number;
  message: string;
  data: {
    page: number;
    page_size: number;
    total: number;
    list: NewsItem[];
  };
}

export interface MacroEventDay {
  date: string;
  events: string[];
}

export interface IndexSnapshot {
  price: number;
  '24h_change_pct': number;
  '7day_roi': number;
  '1month_roi': number;
  '3month_roi': number;
  '1year_roi': number;
  ytd: number;
}
