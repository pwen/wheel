import streamlit as st
import pandas as pd

st.set_page_config(page_title="Wheel Tracker — Demo", layout="wide")

st.title("Wheel Strategy Tracker — Demo")

st.markdown("This is a minimal Streamlit demo showing the trade table schema. No data is populated yet.")

# Define the columns based on the CSV / spreadsheet
columns = [
    "Spot",
    "Type",
    "Spot Price",
    "Strike",
    "Expiry",
    "Qty",
    "Total Premium",
    "Premium Per Share",
    "Break-Even Price",
    "Date Opened",
    "DTE",
    "Date Closed",
    "Action",
    "Closing Cost",
    "Closing Spot Price",
    "Days in Trade",
    "P/L",
    "P/L %",
    "Return",
    "Notes/Journal",
]

# Create empty DataFrame with those columns
df = pd.DataFrame(columns=columns)

st.subheader("Trades")
st.write("No trades yet — use the UI to add trades (future).")
st.dataframe(df)

st.info("Next steps: add manual entry form, backend API, and persistent DB.")
