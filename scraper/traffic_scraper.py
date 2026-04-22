import requests
import time
import random
import os
from db import db
from datetime import datetime

class TrafficScraper:
    def __init__(self):
        self.base_url = 'https://restapi.amap.com/v3/traffic/status/rectangle'
        self.key = os.getenv('AMAP_KEY', '')
        
    def get_traffic_by_rectangle(self, rectangle):
        params = {
            'key': self.key,
            'rectangle': rectangle,
            'level': 5,
            'extensions': 'all'
        }
        
        try:
            response = requests.get(self.base_url, params=params, timeout=10)
            data = response.json()
            
            if data.get('status') != '1':
                print(f"API Error: {data.get('info')}")
                return None
                
            return data.get('trafficinfo', {}).get('evaluation', {})
            
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    def save_traffic_data(self, road_id, congestion_level, avg_speed):
        sql = """
        INSERT INTO traffic_realtime (road_id, congestion_level, avg_speed, record_time)
        VALUES (%s, %s, %s, NOW())
        """
        try:
            db.execute(sql, (road_id, congestion_level, avg_speed))
        except Exception as e:
            print(f"Save traffic error: {e}")

def generate_mock_traffic():
    roads = db.query("SELECT id FROM road LIMIT 50")
    
    for road in roads:
        congestion = random.randint(0, 3)
        speed = random.uniform(15, 40) if congestion < 2 else random.uniform(5, 15)
        
        sql = """
        INSERT INTO traffic_realtime (road_id, congestion_level, avg_speed, record_time)
        VALUES (%s, %s, %s, NOW())
        """
        db.execute(sql, (road['id'], congestion, round(speed, 2)))
    
    print(f"Generated traffic data for {len(roads)} roads at {datetime.now()}")

def generate_mock_events():
    events = [
        {'type': '施工', 'title': '道路施工', 'severity': 'major'},
        {'type': '事故', 'title': '交通事故', 'severity': 'minor'},
        {'type': '封路', 'title': '临时封路', 'severity': 'critical'}
    ]
    
    for _ in range(5):
        event = random.choice(events)
        lng = 114.9 + random.uniform(-0.1, 0.1)
        lat = 25.8 + random.uniform(-0.1, 0.1)
        
        sql = """
        INSERT INTO event_livelihood (event_type, title, geom, severity, status, start_time)
        VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, 'active', NOW())
        """
        db.execute(sql, (event['type'], event['title'], lng, lat, event['severity']))
    
    print(f"Generated mock events at {datetime.now()}")

if __name__ == '__main__':
    db.connect()
    try:
        generate_mock_traffic()
        generate_mock_events()
    finally:
        db.close()
