import schedule
import time
from datetime import datetime
from db import db
from poi_scraper import scrape_cycling_pois, scrape_red_spots
from traffic_scraper import generate_mock_traffic, generate_mock_events

def daily_poi_update():
    print(f"[{datetime.now()}] Starting daily POI update...")
    try:
        scrape_cycling_pois()
        scrape_red_spots()
        print(f"[{datetime.now()}] Daily POI update completed")
    except Exception as e:
        print(f"[{datetime.now()}] POI update error: {e}")

def hourly_traffic_update():
    print(f"[{datetime.now()}] Starting traffic update...")
    try:
        db.connect()
        generate_mock_traffic()
        generate_mock_events()
        db.close()
        print(f"[{datetime.now()}] Traffic update completed")
    except Exception as e:
        print(f"[{datetime.now()}] Traffic update error: {e}")

def main():
    print("=" * 50)
    print("骑行智慧民生 - 数据爬取服务")
    print("=" * 50)
    
    schedule.every().day.at("02:00").do(daily_poi_update)
    schedule.every(5).minutes.do(hourly_traffic_update)
    
    print("Scheduled tasks:")
    print("- POI update: daily at 02:00")
    print("- Traffic update: every 5 minutes")
    print("-" * 50)
    
    print("Running initial tasks...")
    daily_poi_update()
    hourly_traffic_update()
    
    print("Starting scheduler...")
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == '__main__':
    main()
