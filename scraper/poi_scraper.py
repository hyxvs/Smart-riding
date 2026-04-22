import requests
import time
import os
from db import db
from coord_transform import gcj02_to_wgs84

AMAP_KEY = os.getenv('AMAP_KEY', '')

class POIScraper:
    def __init__(self):
        self.base_url = 'https://restapi.amap.com/v3/place/text'
        self.polygon_url = 'https://restapi.amap.com/v3/place/polygon'
        
    def search_by_keywords(self, keywords, city='赣州', types=None):
        params = {
            'key': AMAP_KEY,
            'keywords': keywords,
            'city': city,
            'citylimit': 'true',
            'offset': 50,
            'page': 1,
            'extensions': 'all'
        }
        
        if types:
            params['types'] = types
            
        all_pois = []
        
        while True:
            try:
                response = requests.get(self.base_url, params=params, timeout=10)
                data = response.json()
                
                if data.get('status') != '1':
                    print(f"API Error: {data.get('info')}")
                    break
                    
                pois = data.get('pois', [])
                all_pois.extend(pois)
                
                if len(pois) < 50:
                    break
                    
                params['page'] += 1
                time.sleep(0.2)
                
            except Exception as e:
                print(f"Request error: {e}")
                break
                
        return all_pois
    
    def search_by_polygon(self, polygon, keywords=None, types=None):
        params = {
            'key': AMAP_KEY,
            'polygon': polygon,
            'keywords': keywords or '',
            'offset': 50,
            'page': 1,
            'extensions': 'all'
        }
        
        if types:
            params['types'] = types
            
        all_pois = []
        
        while True:
            try:
                response = requests.get(self.polygon_url, params=params, timeout=10)
                data = response.json()
                
                if data.get('status') != '1':
                    break
                    
                pois = data.get('pois', [])
                all_pois.extend(pois)
                
                if len(pois) < 50:
                    break
                    
                params['page'] += 1
                time.sleep(0.2)
                
            except Exception as e:
                print(f"Request error: {e}")
                break
                
        return all_pois
    
    def save_poi(self, poi_data):
        location = poi_data.get('location', '').split(',')
        if len(location) != 2:
            return None
            
        lng, lat = float(location[0]), float(location[1])
        wgs_lng, wgs_lat = gcj02_to_wgs84(lng, lat)
        
        sql = """
        INSERT INTO poi (name, category, sub_category, geom, address, description, 
                        is_red_spot, safety_rating, scenery_rating, contact_phone)
        VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        RETURNING id
        """
        
        name = poi_data.get('name', '')
        type_code = poi_data.get('typecode', '')
        category = self._get_category(type_code)
        address = poi_data.get('address', '') or poi_data.get('pname', '') + poi_data.get('cityname', '') + poi_data.get('adname', '')
        tel = poi_data.get('tel', '')
        
        is_red = '红色' in name or '革命' in name or '纪念' in name
        
        try:
            result = db.query_one(sql, (
                name, category, poi_data.get('type', ''),
                wgs_lng, wgs_lat, address, '',
                is_red, 3.0, 3.0, tel
            ))
            return result['id'] if result else None
        except Exception as e:
            print(f"Save POI error: {e}")
            return None
    
    def _get_category(self, type_code):
        if not type_code:
            return '其他'
        code = type_code[:2]
        category_map = {
            '05': '餐饮',
            '06': '购物',
            '07': '生活服务',
            '08': '体育休闲',
            '09': '医疗保健',
            '10': '住宿',
            '11': '风景名胜',
            '12': '商务住宅',
            '13': '政府机构',
            '14': '科教文化',
            '15': '交通设施',
            '16': '金融保险',
            '17': '公司企业',
            '18': '道路附属',
            '19': '地名地址',
            '20': '公共设施'
        }
        return category_map.get(code, '其他')

def scrape_cycling_pois():
    scraper = POIScraper()
    
    keywords_list = [
        '自行车',
        '共享单车',
        '骑行',
        '公园',
        '景点',
        '红色景点',
        '纪念馆',
        '革命遗址'
    ]
    
    total = 0
    for keywords in keywords_list:
        print(f"Searching: {keywords}")
        pois = scraper.search_by_keywords(keywords)
        print(f"Found: {len(pois)} POIs")
        
        for poi in pois:
            if scraper.save_poi(poi):
                total += 1
                
        time.sleep(1)
        
    print(f"Total saved: {total} POIs")
    return total

def scrape_red_spots():
    scraper = POIScraper()
    
    red_keywords = [
        '红色景点',
        '革命纪念馆',
        '烈士陵园',
        '革命遗址',
        '红色教育基地',
        '红军'
    ]
    
    total = 0
    for keywords in red_keywords:
        print(f"Searching red spots: {keywords}")
        pois = scraper.search_by_keywords(keywords)
        
        for poi in pois:
            location = poi.get('location', '').split(',')
            if len(location) != 2:
                continue
                
            lng, lat = float(location[0]), float(location[1])
            wgs_lng, wgs_lat = gcj02_to_wgs84(lng, lat)
            
            sql = """
            INSERT INTO poi (name, category, geom, address, is_red_spot, red_description)
            VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, true, %s)
            ON CONFLICT DO NOTHING
            """
            
            try:
                db.execute(sql, (
                    poi.get('name', ''),
                    '红色景点',
                    wgs_lng, wgs_lat,
                    poi.get('address', ''),
                    poi.get('biz_ext', {}).get('rating', '')
                ))
                total += 1
            except Exception as e:
                print(f"Error: {e}")
                
        time.sleep(1)
        
    print(f"Total red spots saved: {total}")
    return total

if __name__ == '__main__':
    db.connect()
    try:
        scrape_cycling_pois()
        scrape_red_spots()
    finally:
        db.close()
