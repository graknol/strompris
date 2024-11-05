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

But actually, it turns out the list is not so Home Assistant friendly, you ideally want a single value for the current time:

`/now?homeassistant=true`:

```json
// We are currently in a high cost hour
true
```

But now the value is kind of the wrong way around, we want to map the low hours to the ON state of our devices, and the high cost hours to the OFF state.  
For that case, we can flip it with `flip=true`.

`/now?homeassistant=true&flip=true`:

```json
// Now a high cost hour, basically means TURN OFF water boilers
false
```

A last little note, working with `boolean` values in Home Assistant automations are a pain, so to make things more UI friendly, we should convert the values
to the strings `on` and `off` to prevent Home Asssistant from parsing them as boolean:

`/now?homeassistant=true&flip=true&type=string`:

```json
"off"
```

Now we can add the sensor in Home Assistant:

```yaml
# configuration.yaml

sensor:
  - platform: rest
    resource: http://10.0.0.4:3010/now?homeassistant=true&flip=true&type=string # Of course, you'll need to replace the IP address here with your own
    name: Strompris Today
    unique_id: strompris_today
```
