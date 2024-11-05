# Strømpris API

This is a simple API for getting the electricity prices in Norway for today and tomorrow.

## Usage

The endpoints `/today` and `/tomorrow`:

```json
[
  {
    "baseCost": 0.23382,
    "cost": 0.37882,
    "start": "2024-11-04T23:00:00.000Z",
    "end": "2024-11-05T00:00:00.000Z",
    "numeral": 0,
    "weekday": 2,
    "discounted": true,
    "isHighCost": false
  },
  {
    "baseCost": 0.24769,
    "cost": 0.39269,
    "start": "2024-11-05T00:00:00.000Z",
    "end": "2024-11-05T01:00:00.000Z",
    "numeral": 1,
    "weekday": 2,
    "discounted": true,
    "isHighCost": false
  }
  // ...
]
```

You can also get only the `HIGH` price hours by setting the query parameter `only=high` (the number of high hours is configured in main.js `NUMBER_OF_HIGH_PRICE_HOURS` which is set to `8` by default).

Example `/today?only=high`:

```json
[
  {
    "baseCost": 0.28058,
    "cost": 0.50558,
    "start": "2024-11-05T07:00:00.000Z",
    "end": "2024-11-05T08:00:00.000Z",
    "numeral": 8,
    "weekday": 2,
    "discounted": false,
    "isHighCost": true
  },
  {
    "baseCost": 0.31634,
    "cost": 0.54134,
    "start": "2024-11-05T08:00:00.000Z",
    "end": "2024-11-05T09:00:00.000Z",
    "numeral": 9,
    "weekday": 2,
    "discounted": false,
    "isHighCost": true
  }
  // ...
]
```

Lastly, if you're like me, you probably only care about the 24-hour numerical hour value of the `HIGH` price hours, in which case, this is what you want:

`/today?only=high&numerals=true`:

```json
[8, 9, 10, 11, 12, 13, 17, 18]
```

With this list, it's so easy to make an automation in Home Assistant (with the use of the [RESTful Sensor](https://www.home-assistant.io/integrations/sensor.rest/)) which turns off water boilers at the most expensive hours of the day.

But actually, it turns out the list is not so Home Assistant friendly, you ideally want an object with a single property for each of the 24 hours:

`/today?homeassistant=true`:

```json
{
  "hour00": false,
  "hour01": false,
  "hour02": false,
  "hour03": false,
  "hour04": false,
  "hour05": false,
  "hour06": false,
  "hour07": false,
  "hour08": true,
  "hour09": true,
  "hour10": true,
  "hour11": true,
  "hour12": true,
  "hour13": true,
  "hour14": false,
  "hour15": false,
  "hour16": false,
  "hour17": true,
  "hour18": true,
  "hour19": false,
  "hour20": false,
  "hour21": false,
  "hour22": false,
  "hour23": false
}
```

But now the list is kind of the wrong way around, we want to map the low hours to the ON state of our devices, and the high cost hours to the OFF state.  
For that case, we can flip them with `flip=true`.

`/today?homeassistant=true&flip=true`:

```json
{
  "hour00": true,
  "hour01": true,
  "hour02": true,
  "hour03": true,
  "hour04": true,
  "hour05": true,
  "hour06": true,
  "hour07": true,
  "hour08": false,
  "hour09": false,
  "hour10": false,
  "hour11": false,
  "hour12": false,
  "hour13": false,
  "hour14": true,
  "hour15": true,
  "hour16": true,
  "hour17": false,
  "hour18": false,
  "hour19": true,
  "hour20": true,
  "hour21": true,
  "hour22": true,
  "hour23": true
}
```

Now we can add the sensor in Home Assistant:

```yaml
# configuration.yaml

sensor:
  - platform: rest
    resource: http://10.0.0.4:3010/today?homeassistant=true&flip=true # Of course, you'll need to replace the IP address here with your own
    name: Strompris Today
    unique_id: strompris_today
```
