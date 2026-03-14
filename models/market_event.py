import enum
from datetime import date, datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class EventType(str, enum.Enum):
    # US — per-symbol
    US_EARNINGS = "us_earnings"
    US_EX_DIVIDEND = "us_ex_dividend"
    # US — macro
    US_OPEX = "us_opex"
    US_TRIPLE_WITCHING = "us_triple_witching"
    US_FOMC = "us_fomc"
    US_CPI = "us_cpi"
    US_JOBS = "us_jobs"
    US_GDP = "us_gdp"
    US_PCE = "us_pce"
    US_PPI = "us_ppi"
    US_ISM_MFG = "us_ism_mfg"
    US_ISM_SVC = "us_ism_svc"
    US_RETAIL_SALES = "us_retail_sales"
    US_CONSUMER_CONF = "us_consumer_conf"
    US_JOLTS = "us_jolts"
    US_JACKSON_HOLE = "us_jackson_hole"
    US_MICHIGAN = "us_michigan"
    US_RUSSELL_RECON = "us_russell_recon"
    US_SP500_REBAL = "us_sp500_rebal"
    OPEC_MEETING = "opec_meeting"
    COMEX_GOLD_DELIVERY = "comex_gold_delivery"
    WGC_DEMAND = "wgc_demand"
    AI_SAFETY_SUMMIT = "ai_safety_summit"
    G7_SUMMIT = "g7_summit"
    WAIC_SHANGHAI = "waic_shanghai"
    CES = "ces"
    WUZHEN_WIC = "wuzhen_wic"
    HUAWEI_CONNECT = "huawei_connect"
    CN_AUTO_SHOW = "cn_auto_show"
    BAIDU_WORLD = "baidu_world"
    ZHONGGUANCUN = "zhongguancun"
    CATL_INNOVATION = "catl_innovation"
    WORLD_BATTERY_EXPO = "world_battery_expo"
    NVIDIA_GTC = "nvidia_gtc"
    COMPUTEX = "computex"
    SEMICON_WEST = "semicon_west"
    HOT_CHIPS = "hot_chips"
    US_BIS_EXPORT = "us_bis_export"
    CERAWEEK = "ceraweek"
    IEA_WEO = "iea_weo"
    FERC_MEETING = "ferc_meeting"
    UN_COP = "un_cop"
    DAVOS_WEF = "davos_wef"
    GOOGLE_IO = "google_io"
    AWS_REINVENT = "aws_reinvent"
    MS_BUILD = "ms_build"
    # China
    CN_LPR = "cn_lpr"
    CN_GDP = "cn_gdp"
    CN_CPI = "cn_cpi"
    CN_PPI = "cn_ppi"
    CN_PMI = "cn_pmi"
    CAIXIN_PMI = "caixin_pmi"
    TWO_SESSIONS = "two_sessions"
    CN_TRADE = "cn_trade"
    CEWC = "cewc"
    # EU
    EU_ECB = "eu_ecb"
    EU_CPI = "eu_cpi"
    EU_GDP = "eu_gdp"
    EU_PMI = "eu_pmi"
    EU_ECB_MINUTES = "eu_ecb_minutes"
    EU_TRADE = "eu_trade"
    # Germany
    DE_IFO = "de_ifo"
    # Japan
    JP_BOJ = "jp_boj"
    JP_CPI = "jp_cpi"
    JP_TANKAN = "jp_tankan"
    # India
    IN_RBI = "in_rbi"
    IN_CPI = "in_cpi"
    IN_GDP = "in_gdp"
    # Brazil
    BR_COPOM = "br_copom"
    BR_CPI = "br_cpi"
    # Mexico
    MX_BANXICO = "mx_banxico"
    MX_CPI = "mx_cpi"


class EventSource(str, enum.Enum):
    YFINANCE = "yfinance"
    COMPUTED = "computed"
    MANUAL = "manual"


class MarketEvent(SQLModel, table=True):
    __table_args__ = (
        sa.Index("ix_marketevent_type_date_symbol", "event_type", "event_date", "symbol"),
    )
    model_config = {"use_enum_values": True}  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    event_type: EventType = Field(index=True, sa_type=sa.String)
    event_date: date = Field(index=True)
    symbol: Optional[str] = Field(default=None, index=True)
    region: str = Field(default="US", index=True)
    title: str
    notes: Optional[str] = None
    url: Optional[str] = None
    impact: int = Field(default=2)
    source: EventSource = Field(default=EventSource.MANUAL, sa_type=sa.String)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
