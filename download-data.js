import fs from 'fs'
import fetch from 'node-fetch'

const EXIST_HOUSE_PRICING_LIST_PATH = './house-pricing-list.json'
const CATEGORY_TYPE = 'json'
const DATASET_BASE_URL = 'https://data.ntpc.gov.tw/api/datasets'
const datasets = [
  '57b355c5-9acd-4189-ae66-71c2445a3b25', // 中和區
  '8215efda-18cb-4d5b-a7ed-c76735b07a12', // 永和區
]
const GOOGLE_MAP_API_KEY = process.env.GOOGLE_MAP_API_KEY

/**
 * district(鄉鎮市區)、rps01(交易標的)、rps02(土地區段位置建物區段門牌)、rps03(土地移轉總面積平方公尺)、rps04(都市土地使用分區)、rps05(非都市土地使用分區)、rps06(非都市土地使用編定)、rps07(交易年月日)、rps08(交易筆棟數)、rps09(移轉層次)、rps10(總樓層數)、rps11(建物型態)、rps12(主要用途)、rps13(主要建材)、rps14(建築完成年月)、rps15(建物移轉總面積平方公尺)、rps16(建物現況格局-房)、rps17(建物現況格局-廳)、rps18(建物現況格局-衛)、rps19(建物現況格局-隔間)、rps20(有無管理組織)、rps21(總價元)、rps22(單價元平方公尺)、rps23(車位類別)、rps24(車位移轉總面積平方公尺)、rps25(車位總價元)、rps26(備註)、rps27(編號)、rps28(主建物面積)、rps29(附屬建物面積)、rps30(陽台面積)、rps31(電梯)
 */
const getLatestHousePricingList = async () => {
  const promises = datasets.map(async (dataset) => {
    const url = `${DATASET_BASE_URL}/${dataset}/${CATEGORY_TYPE}?page=0&size=10000`
    const data = await fetch(url)
    return data.json()
  })

  const list = await Promise.all(promises)

  return list.flat()
}

const getExistHousePricingList = () => {
  if (fs.existsSync(EXIST_HOUSE_PRICING_LIST_PATH)) return JSON.parse(fs.readFileSync(EXIST_HOUSE_PRICING_LIST_PATH))
  return []
}

const mergeHousePricingList = async (existList, latestList) => {
  const existIdMap = new Map(existList.map(item => [item.rps27, item]));
  
  latestList.forEach((item) => {
    if (!existIdMap.has(item.rps27)) {
      existList.push(item)
      return
    }
    const existItem = existIdMap.get(item.rps27)
    if (existItem.rps07 === item.rps07) return
    const newHistories = existItem.histories || []
    newHistories.push({
      date: existItem.rps07,
      price: existItem.rps21,
      pricePerSquareMeter: existItem.rps22,
    })

    existItem.histories = newHistories
    existItem.rps07 = item.rps07
    existItem.rps21 = item.rps21
    existItem.rps22 = item.rps22
  })

  return existList
}

const getLatLng = async (address) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAP_API_KEY}`
  const data = await fetch(url)
  const { results, error_message } = await data.json()
  if (error_message || !results[0]) {
    console.error(error_message)
    return
  }

  return results[0].geometry.location;
};


const addLocation = async (list) => {
  for (let index = 0; index < list.length; index++) {
    const item = list[index];
    if (item.location) continue
    const location = await getLatLng(item.rps02)
    item.location = location || {}
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  fs.writeFileSync(EXIST_HOUSE_PRICING_LIST_PATH, JSON.stringify(list))
}

const download = async () => {
    // 拿取最新的實價登錄資料
    const latestList = await getLatestHousePricingList()
    // 拿取已經存在的實價登錄資料
    const existList = await getExistHousePricingList()
    // 合併資料並更新實價登錄價格的歷史資料寫進去 histories
    const mergedList = await mergeHousePricingList(existList, latestList)
    // 將還沒有 GeoLocation 的資料寫進去 location
    await addLocation(mergedList)
    fs.writeFileSync(EXIST_HOUSE_PRICING_LIST_PATH, JSON.stringify(mergedList))
}

download()