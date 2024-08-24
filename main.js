process.env.TZ = "Europe/Oslo";

const express = require("express");
const app = express();
const port = 3000;

const axios = require("axios");
const moment = require("moment");

const FULL_NETTLEIE = 0.225;
const DISCOUNTED_NETTLEIE = 0.145;

const area = "NO5";

const cache = new Map();
const cacheKeepLast = 7;

function cleanCache() {
  const dates = [...cache.keys()];
  dates.sort((a, b) => b.start - a.start);
  let idx = 0;
  for (const date in dates) {
    const keep = idx < cacheKeepLast;
    if (!keep) {
      cache.delete(date);
    }
    idx++;
  }
}

function getCacheKey(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const y = year.toString().padStart(4, "0");
  const m = month.toString().padStart(2, "0");
  const d = day.toString().padStart(2, "0");

  return `${y}-${m}-${d}`;
}

async function getPrices(date) {
  const cacheKey = getCacheKey(date);
  if (cache.has(cacheKey)) {
    console.log("Cache hit!");
    const prices = cache.get(cacheKey);
    cleanCache();
    return prices;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const y = year.toString().padStart(4, "0");
  const m = month.toString().padStart(2, "0");
  const d = day.toString().padStart(2, "0");

  const url = `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_${area}.json`;

  let data;
  try {
    const res = await axios.get(url);
    data = res.data;
  } catch (e) {
    if (e.status == 404) {
      return null;
    }
    throw e;
  }

  const hours = data.map((d) => {
    const start = new Date(d.time_start);
    const numeral = start.getHours();
    const weekday = moment(start).isoWeekday();
    const discounted =
      [6, 7].includes(weekday) || [22, 23, 0, 1, 2, 3, 4, 5].includes(numeral);
    const baseCost = d.NOK_per_kWh;
    const cost = discounted
      ? baseCost + DISCOUNTED_NETTLEIE
      : baseCost + FULL_NETTLEIE;
    return {
      baseCost: baseCost,
      cost: cost,
      start: start,
      end: new Date(d.time_end),
      numeral: numeral,
      weekday: weekday,
      discounted: discounted,
    };
  });

  hours.sort((a, b) => a.start - b.start);

  cache.set(cacheKey, hours);
  return hours;
}

async function getPricesToday() {
  return await getPrices(new Date());
}

async function getPricesTomorrow() {
  const tomorrow = moment().add(1, "d");
  return await getPrices(tomorrow.toDate());
}

app.get("/today", async (req, res) => {
  const prices = await getPricesToday();
  res.send(prices ?? []);
});

app.get("/tomorrow", async (req, res) => {
  const prices = await getPricesTomorrow();
  res.send(prices ?? []);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
