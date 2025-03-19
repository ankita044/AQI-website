from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import numpy as np
from catboost import CatBoostRegressor

# Load the CatBoost model
model = CatBoostRegressor()
model.load_model("model/cat.cbm")

app = Flask(__name__)
CORS(app)

# AQICN API Key and Endpoint
API_KEY = '64290e07f158484e2d2f271320fe1826ce447c34'
API_URL = 'http://api.waqi.info/feed/{}/?token={}'

# Function to calculate AQI category
def get_aqi_category(aqi):
    if aqi <= 50:
        return "Good"
    elif aqi <= 100:
        return "Moderate"
    elif aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    elif aqi <= 200:
        return "Unhealthy"
    elif aqi <= 300:
        return "Very Unhealthy"
    else:
        return "Hazardous"

@app.route('/get-aqi', methods=['POST'])
def get_aqi():
    try:
        data = request.get_json()
        city = data.get('city')

        if not city:
            return jsonify({'error': 'City name is required'}), 400

        # Fetch real-time data from the API
        response = requests.get(API_URL.format(city, API_KEY))
        response.raise_for_status()  # Raise exception for HTTP errors
        response_data = response.json()

        if response_data.get('status') != 'ok':
            return jsonify({'error': 'Failed to fetch data from API'}), 400

        raw_data = response_data['data'].get('iaqi', {})

        # Extract pollutants with fallback to 0 if missing
        pm25 = raw_data.get('pm25', {}).get('v', 0.0)
        pm10 = raw_data.get('pm10', {}).get('v', 0.0)
        o3 = raw_data.get('o3', {}).get('v', 0.0)
        no2 = raw_data.get('no2', {}).get('v', 0.0)
        so2 = raw_data.get('so2', {}).get('v', 0.0)
        co = raw_data.get('co', {}).get('v', 0.0)

        # Prepare input for the model
        input_data = np.array([[pm25, pm10, o3, no2, so2, co]], dtype=float)
        predicted_aqi = model.predict(input_data)[0]
        aqi_category = get_aqi_category(predicted_aqi)

        return jsonify({
            'city': city,
            'pm25': round(pm25, 2),
            'pm10': round(pm10, 2),
            'o3': round(o3, 2),
            'no2': round(no2, 2),
            'so2': round(so2, 2),
            'co': round(co, 2),
            'predicted_aqi': round(predicted_aqi, 2),
            'aqi_category': aqi_category
        })

    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
