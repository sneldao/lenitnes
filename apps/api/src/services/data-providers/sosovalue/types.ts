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
  author?: string;
  nick_name?: string;
  author_description?: string;
  author_avatar_url?: string;
  category: number;
  matched_currencies: NewsCurrencyMatch[];
  tags: string[];
  impression_count: number;
  like_count: number;
  reply_count: number;
  retweet_count?: number;
  is_blue_verified?: boolean;
  verified_type?: string;
  feature_image?: string;
  media_info?: unknown;
  quote_info?: unknown;
}

export interface NewsFeedResponse {
  page: number;
  page_size: number;
  total: number;
  list: NewsItem[];
}

export interface NewsSearchResponse {
  page: number;
  page_size: number;
  total: number;
  list: NewsItem[];
}

export interface MacroEventDay {
  date: string;
  events: string[];
}

export interface IndexSnapshot {
  price: number;
  change_pct_24h: number;
  roi_7d: number;
  roi_1m: number;
  roi_3m: number;
  roi_1y: number;
  ytd: number;
}
