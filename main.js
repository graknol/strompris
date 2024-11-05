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

  if (req.query.homeassistant == "true") {
    const flip = req.query.flip == "true";
    // Convert the list to an object with 24 properties and their values
    // true/false depending on whether they are high price hours or not
    res.send({
      hour00: flip ? !prices[0].isHighCost : prices[0].isHighCost,
      hour01: flip ? !prices[1].isHighCost : prices[1].isHighCost,
      hour02: flip ? !prices[2].isHighCost : prices[2].isHighCost,
      hour03: flip ? !prices[3].isHighCost : prices[3].isHighCost,
      hour04: flip ? !prices[4].isHighCost : prices[4].isHighCost,
      hour05: flip ? !prices[5].isHighCost : prices[5].isHighCost,
      hour06: flip ? !prices[6].isHighCost : prices[6].isHighCost,
      hour07: flip ? !prices[7].isHighCost : prices[7].isHighCost,
      hour08: flip ? !prices[8].isHighCost : prices[8].isHighCost,
      hour09: flip ? !prices[9].isHighCost : prices[9].isHighCost,
      hour10: flip ? !prices[10].isHighCost : prices[10].isHighCost,
      hour11: flip ? !prices[11].isHighCost : prices[11].isHighCost,
      hour12: flip ? !prices[12].isHighCost : prices[12].isHighCost,
      hour13: flip ? !prices[13].isHighCost : prices[13].isHighCost,
      hour14: flip ? !prices[14].isHighCost : prices[14].isHighCost,
      hour15: flip ? !prices[15].isHighCost : prices[15].isHighCost,
      hour16: flip ? !prices[16].isHighCost : prices[16].isHighCost,
      hour17: flip ? !prices[17].isHighCost : prices[17].isHighCost,
      hour18: flip ? !prices[18].isHighCost : prices[18].isHighCost,
      hour19: flip ? !prices[19].isHighCost : prices[19].isHighCost,
      hour20: flip ? !prices[20].isHighCost : prices[20].isHighCost,
      hour21: flip ? !prices[21].isHighCost : prices[21].isHighCost,
      hour22: flip ? !prices[22].isHighCost : prices[22].isHighCost,
      hour23: flip ? !prices[23].isHighCost : prices[23].isHighCost,
    });
    return;
  }

  if (req.query.only == "high") {
    prices = prices.filter((h) => h.isHighCost);

    if (req.query.numerals == "true") {
      prices = prices.map((h) => h.numeral);
    }
  }

  res.send(prices ?? []);
});

app.get("/tomorrow", async (req, res) => {
  const prices = await getPricesTomorrow();

  if (req.query.homeassistant == "true") {
    const flip = req.query.flip == "true";
    // Convert the list to an object with 24 properties and their values
    // true/false depending on whether they are high price hours or not
    res.send({
      hour00: flip ? !prices[0].isHighCost : prices[0].isHighCost,
      hour01: flip ? !prices[1].isHighCost : prices[1].isHighCost,
      hour02: flip ? !prices[2].isHighCost : prices[2].isHighCost,
      hour03: flip ? !prices[3].isHighCost : prices[3].isHighCost,
      hour04: flip ? !prices[4].isHighCost : prices[4].isHighCost,
      hour05: flip ? !prices[5].isHighCost : prices[5].isHighCost,
      hour06: flip ? !prices[6].isHighCost : prices[6].isHighCost,
      hour07: flip ? !prices[7].isHighCost : prices[7].isHighCost,
      hour08: flip ? !prices[8].isHighCost : prices[8].isHighCost,
      hour09: flip ? !prices[9].isHighCost : prices[9].isHighCost,
      hour10: flip ? !prices[10].isHighCost : prices[10].isHighCost,
      hour11: flip ? !prices[11].isHighCost : prices[11].isHighCost,
      hour12: flip ? !prices[12].isHighCost : prices[12].isHighCost,
      hour13: flip ? !prices[13].isHighCost : prices[13].isHighCost,
      hour14: flip ? !prices[14].isHighCost : prices[14].isHighCost,
      hour15: flip ? !prices[15].isHighCost : prices[15].isHighCost,
      hour16: flip ? !prices[16].isHighCost : prices[16].isHighCost,
      hour17: flip ? !prices[17].isHighCost : prices[17].isHighCost,
      hour18: flip ? !prices[18].isHighCost : prices[18].isHighCost,
      hour19: flip ? !prices[19].isHighCost : prices[19].isHighCost,
      hour20: flip ? !prices[20].isHighCost : prices[20].isHighCost,
      hour21: flip ? !prices[21].isHighCost : prices[21].isHighCost,
      hour22: flip ? !prices[22].isHighCost : prices[22].isHighCost,
      hour23: flip ? !prices[23].isHighCost : prices[23].isHighCost,
    });
    return;
  }

  if (req.query.only == "high") {
    prices = prices.filter((h) => h.isHighCost);

    if (req.query.numerals == "true") {
      prices = prices.map((h) => h.numeral);
    }
  }

  res.send(prices ?? []);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
