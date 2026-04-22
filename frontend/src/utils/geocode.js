/**
 * 地理编码工具 - 坐标与地址互转
 * 使用高德地图 API 进行地址反解析
 */

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || ''

/**
 * 坐标反解析为地址
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {Promise<{address: string, formattedAddress: string, province: string, city: string, district: string, street: string}>}
 */
export async function reverseGeocode(lng, lat) {
  if (!AMAP_KEY) {
    console.warn('未配置高德地图 API Key，使用默认地址格式')
    return {
      address: `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
      formattedAddress: `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`,
      province: '',
      city: '',
      district: '',
      street: ''
    }
  }

  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${lng},${lat}&extensions=base&radius=1000`
    )
    const data = await response.json()

    if (data.status === '1' && data.regeocode) {
      const regeocode = data.regeocode
      const addressComponent = regeocode.addressComponent || {}

      return {
        address: regeocode.formatted_address,
        formattedAddress: regeocode.formatted_address,
        province: addressComponent.province || '',
        city: addressComponent.city || addressComponent.province || '',
        district: addressComponent.district || '',
        street: addressComponent.street || '',
        streetNumber: addressComponent.streetNumber || ''
      }
    }

    throw new Error('地址解析失败')
  } catch (error) {
    console.error('地址反解析失败:', error)
    return {
      address: `${lng.toFixed(6)}, ${lat.toFixed(6)}`,
      formattedAddress: `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`,
      province: '',
      city: '',
      district: '',
      street: ''
    }
  }
}

/**
 * 地址解析为坐标
 * @param {string} address - 地址
 * @returns {Promise<{lng: number, lat: number, location: string}>}
 */
export async function geocode(address) {
  if (!AMAP_KEY) {
    throw new Error('未配置高德地图 API Key')
  }

  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?key=${AMAP_KEY}&address=${encodeURIComponent(address)}`
    )
    const data = await response.json()

    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const location = data.geocodes[0].location.split(',')
      return {
        lng: parseFloat(location[0]),
        lat: parseFloat(location[1]),
        location: data.geocodes[0].location
      }
    }

    throw new Error('地址解析失败')
  } catch (error) {
    console.error('地址解析失败:', error)
    throw error
  }
}

/**
 * 简化地址显示
 * @param {string} address - 完整地址
 * @param {number} maxLength - 最大长度
 * @returns {string}
 */
export function simplifyAddress(address, maxLength = 30) {
  if (!address) return ''
  if (address.length <= maxLength) return address
  return address.substring(0, maxLength) + '...'
}
