import requests
import time
import json
from db import db

class OSMPOIScraper:
    def __init__(self):
        self.overpass_url = 'http://overpass-api.de/api/interpreter'
        self.ganzhou_bbox = '25.6,114.8,26.1,115.1'  # 赣州市大致边界
    
    def query_osm(self, query):
        response = requests.get(self.overpass_url, params={'data': query})
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Overpass API error: {response.status_code}")
            print(f"Query: {query[:500]}...")
            return None
    
    def get_pois_by_category(self, category_tags, bbox=None):
        bbox = bbox or self.ganzhou_bbox
        
        # 构建查询
        query_parts = []
        query_parts.append('[out:json];')
        query_parts.append('(')
        
        # 添加标签条件
        for key, values in category_tags.items():
            if isinstance(values, list):
                for value in values:
                    query_parts.append(f'  node["{key}"="{value}"]({bbox});')
                    query_parts.append(f'  way["{key}"="{value}"]({bbox});')
                    query_parts.append(f'  relation["{key}"="{value}"]({bbox});')
            else:
                query_parts.append(f'  node["{key}"="{values}"]({bbox});')
                query_parts.append(f'  way["{key}"="{values}"]({bbox});')
                query_parts.append(f'  relation["{key}"="{values}"]({bbox});')
        
        query_parts.append(');')
        query_parts.append('out center;')
        
        query = '\n'.join(query_parts)
        
        return self.query_osm(query)
    
    def get_cycling_related_pois(self):
        # 骑行相关POI
        cycling_tags = {
            'amenity': ['bicycle_parking', 'bicycle_repair_station', 'bicycle_rental'],
            'leisure': ['park', 'cycleway'],
            'highway': ['cycleway']
        }
        return self.get_pois_by_category(cycling_tags)
    
    def get_red_spots(self):
        # 红色景点相关POI
        red_tags = {
            'tourism': ['attraction', 'museum', 'monument'],
            'historic': ['memorial', 'monument', 'castle']
        }
        return self.get_pois_by_category(red_tags)
    
    def get_general_pois(self):
        # 一般POI（餐饮、购物、服务等）
        general_tags = {
            'amenity': ['restaurant', 'cafe', 'shop', 'fuel', 'toilets', 'bank'],
            'shop': ['supermarket', 'convenience', 'clothes'],
            'tourism': ['hotel', 'guest_house']
        }
        return self.get_pois_by_category(general_tags)
    
    def save_poi(self, element):
        try:
            # 处理节点
            if element['type'] == 'node':
                lng = element['lon']
                lat = element['lat']
            # 处理面和关系
            elif 'center' in element:
                lng = element['center']['lon']
                lat = element['center']['lat']
            else:
                return None
            
            # 提取标签
            tags = element.get('tags', {})
            name = tags.get('name', '')
            
            # 跳过没有名称的POI
            if not name:
                return None
            
            amenity = tags.get('amenity', '')
            tourism = tags.get('tourism', '')
            historic = tags.get('historic', '')
            shop = tags.get('shop', '')
            leisure = tags.get('leisure', '')
            highway = tags.get('highway', '')
            
            # 确定类别
            category = self._get_category(amenity, tourism, historic, shop, leisure, highway)
            
            # 检查是否为红色景点
            is_red_spot = self._is_red_spot(name, tags)
            
            # 地址信息
            address = tags.get('addr:full', '')
            if not address:
                address_parts = []
                if tags.get('addr:housenumber'):
                    address_parts.append(tags.get('addr:housenumber'))
                if tags.get('addr:street'):
                    address_parts.append(tags.get('addr:street'))
                if tags.get('addr:city'):
                    address_parts.append(tags.get('addr:city'))
                address = ', '.join(address_parts)
            
            # 联系方式
            contact_phone = tags.get('phone', '')
            
            # 描述
            description = ''
            if tags.get('description'):
                description = tags.get('description')
            elif tags.get('note'):
                description = tags.get('note')
            
            # 保存到数据库
            sql = """
            INSERT INTO poi (name, category, sub_category, geom, address, description, 
                            is_red_spot, safety_rating, scenery_rating, contact_phone, status)
            VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id
            """
            
            try:
                result = db.query_one(sql, (
                    name, 
                    category,
                    f"{amenity or tourism or historic or shop or leisure or highway}",
                    lng, lat, 
                    address, 
                    description, 
                    is_red_spot, 
                    3.0,  # 安全评分默认值
                    3.0,  # 风景评分默认值
                    contact_phone,
                    'normal'
                ))
                if result:
                    print(f"Saved POI: {name} ({category})")
                    return result['id']
                else:
                    print(f"POI already exists: {name}")
                    return None
            except Exception as e:
                print(f"Save POI error: {e}")
                print(f"POI data: {name}, {lng}, {lat}")
                return None
        except Exception as e:
            print(f"Processing POI error: {e}")
            return None
    
    def _get_category(self, amenity, tourism, historic, shop, leisure, highway):
        if amenity:
            if amenity in ['restaurant', 'cafe', 'fast_food']:
                return '餐饮'
            elif amenity in ['shop', 'supermarket', 'convenience']:
                return '购物'
            elif amenity in ['bank', 'atm']:
                return '金融保险'
            elif amenity in ['toilets', 'fuel', 'parking']:
                return '生活服务'
            elif amenity in ['bicycle_parking', 'bicycle_repair_station', 'bicycle_rental']:
                return '骑行设施'
        elif tourism:
            if tourism in ['attraction', 'museum', 'monument', 'hotel', 'guest_house']:
                return '风景名胜'
        elif historic:
            return '红色景点'
        elif leisure:
            if leisure in ['park', 'garden']:
                return '风景名胜'
        elif highway == 'cycleway':
            return '骑行设施'
        return '其他'
    
    def _is_red_spot(self, name, tags):
        red_keywords = ['红色', '革命', '纪念', '烈士', '红军', '抗战', '解放']
        for keyword in red_keywords:
            if keyword in name:
                return True
        
        if tags.get('historic') in ['memorial', 'monument']:
            return True
        
        return False
    
    def scrape_all_pois(self):
        print("开始从OpenStreetMap爬取POI数据...")
        
        total_saved = 0
        
        # 爬取骑行相关POI
        print("爬取骑行相关POI...")
        cycling_data = self.get_cycling_related_pois()
        if cycling_data and 'elements' in cycling_data:
            for element in cycling_data['elements']:
                if self.save_poi(element):
                    total_saved += 1
        
        time.sleep(2)  # 避免API限流
        
        # 爬取红色景点
        print("爬取红色景点...")
        red_data = self.get_red_spots()
        if red_data and 'elements' in red_data:
            for element in red_data['elements']:
                if self.save_poi(element):
                    total_saved += 1
        
        time.sleep(2)  # 避免API限流
        
        # 爬取一般POI
        print("爬取一般POI...")
        general_data = self.get_general_pois()
        if general_data and 'elements' in general_data:
            for element in general_data['elements']:
                if self.save_poi(element):
                    total_saved += 1
        
        print(f"从OpenStreetMap爬取完成，共保存 {total_saved} 个POI")
        return total_saved

def main():
    print("正在连接数据库...")
    try:
        conn = db.connect()
        print(f"数据库连接成功: {conn.dsn}")
        
        scraper = OSMPOIScraper()
        scraper.scrape_all_pois()
        
        # 手动提交事务
        conn.commit()
        print("事务提交成功")
        
    except Exception as e:
        print(f"数据库操作错误: {e}")
    finally:
        db.close()
        print("数据库连接已关闭")

if __name__ == '__main__':
    main()
