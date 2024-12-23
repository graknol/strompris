process.env.TZ = "Europe/Oslo";

const express = require("express");
const app = express();
const port = 3010;

const axios = require("axios");
const moment = require("moment");

const FULL_NETTLEIE = 0.225;
const DISCOUNTED_NETTLEIE = 0.145;

// It is advised to keep this at maximum 8, which ensures that the water boiler gets to turn on at least 16 hours per day.
// This is to prevent the water from being too cold for too long, which would lead to bacteria growing in the tank.
//
// Additionally, looking at historical data, the prices typically spike for 3 hours, twice a day, which amounts to 6 hours each day.
// With this setting set to 8, we ensure that we at least avoid those 6 worst hours, especially when the prices fluctuate a lot during the winter.
const NUMBER_OF_HIGH_PRICE_HOURS = 8;

// The hours of the day that are preferable to have the water turned on if possible.
const PREFERABLE_HOURS = [5, 6, 7, 17, 18, 19];

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

  // Compute the costs that are classified as HIGH
  const costs = hours.map((h) => h.cost);
  costs.sort();
  costs.reverse();
  const highCosts = costs.slice(0, NUMBER_OF_HIGH_PRICE_HOURS);

  // Classify each hour
  const classifiedHours = hours.map((h) => {
    const isHighCost = highCosts.includes(h.cost);
    return {
      ...h,
      isHighCost: isHighCost,
    };
  });

  // BUG: If the highest prices are 0.45 and 0.37, and more than 8 hours have these prices,
  // then more than 8 hours (which is our max) will be classified as HIGH, which is severe!
  // We want the most hot water at the start of the day...
  let highCostHourCount = 0;
  classifiedHours.forEach((h) => {
    if (h.isHighCost) {
      highCostHourCount++;
    }
  });

  // Reduce the amount of high cost hours until we get down to the maximum number of high price hours.
  //
  // Let's check the preferable hours first...
  let i = 0;
  while (
    highCostHourCount > NUMBER_OF_HIGH_PRICE_HOURS &&
    i < PREFERABLE_HOURS.length
  ) {
    const j = PREFERABLE_HOURS[i];
    if (classifiedHours[j].isHighCost) {
      classifiedHours[j].isHighCost = false;
      highCostHourCount--;
    }
  }
  // Check every single hour from the start of the day towards the end of the day.
  i = 0;
  while (highCostHourCount > NUMBER_OF_HIGH_PRICE_HOURS) {
    if (classifiedHours[i].isHighCost) {
      classifiedHours[i].isHighCost = false;
      highCostHourCount--;
    }
  }

  cache.set(cacheKey, classifiedHours);
  return classifiedHours;
}

async function getPricesToday() {
  return await getPrices(new Date());
}

async function getPricesTomorrow() {
  const tomorrow = moment().add(1, "d");
  return await getPrices(tomorrow.toDate());
}

app.get("/today", async (req, res) => {
  let prices = await getPricesToday();

  if (req.query.only == "high") {
    prices = prices.filter((h) => h.isHighCost);

    if (req.query.numerals == "true") {
      prices = prices.map((h) => h.numeral);
    }
  }

  res.json(prices ?? []);
});

app.get("/tomorrow", async (req, res) => {
  const prices = await getPricesTomorrow();

  if (req.query.only == "high") {
    prices = prices.filter((h) => h.isHighCost);

    if (req.query.numerals == "true") {
      prices = prices.map((h) => h.numeral);
    }
  }

  res.json(prices ?? []);
});

app.get("/now", async (req, res) => {
  let prices = await getPricesToday();

  // Current price
  const now = Date.now();
  const currentPrices = prices.filter((h) => h.start <= now && h.end > now);

  if (currentPrices.length <= 0) {
    res.status(500);
    return;
  }

  const currentPrice = currentPrices[0];

  if (req.query.homeassistant == "true") {
    const isHighCost = currentPrice.isHighCost;
    const flip = req.query.flip == "true";

    const result = flip ? !isHighCost : isHighCost;

    res.json(result);
    return;
  }

  res.json(currentPrice);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
