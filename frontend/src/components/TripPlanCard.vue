<template>
  <div class="trip-plan-card" v-if="visible">
    <div class="trip-header">
      <div class="trip-title">
        <el-icon><Calendar /></el-icon>
        <span>{{ plan.destination }} - {{ plan.durationDays }}天骑行计划</span>
      </div>
      <el-button type="primary" size="small" @click="viewDetails">
        查看详情
      </el-button>
    </div>

    <div class="trip-info">
      <div class="info-item">
        <el-icon><Location /></el-icon>
        <span>{{ plan.destination }}</span>
      </div>
      <div class="info-item">
        <el-icon><Clock /></el-icon>
        <span>{{ plan.durationDays }}天</span>
      </div>
      <div class="info-item" v-if="plan.budget">
        <el-icon><Money /></el-icon>
        <span>预算: {{ plan.budget }}元</span>
      </div>
    </div>

    <div class="day-plans" v-if="plan.dayPlans && plan.dayPlans.length > 0">
      <div class="day-plan-item" v-for="dayPlan in plan.dayPlans.slice(0, 3)" :key="dayPlan.id">
        <div class="day-header">
          <span class="day-title">第{{ dayPlan.dayNumber }}天</span>
          <span class="day-theme">{{ dayPlan.theme }}</span>
        </div>
        <div class="attractions" v-if="dayPlan.attractions && dayPlan.attractions.length > 0">
          <div class="attraction-item" v-for="attr in dayPlan.attractions.slice(0, 2)" :key="attr.id">
            <el-icon><Place /></el-icon>
            <span>{{ attr.poiName }}</span>
            <el-tag size="small" :type="attr.isRedSpot ? 'danger' : 'success'">
              {{ attr.visitType }}
            </el-tag>
          </div>
        </div>
        <div class="weather-info" v-if="dayPlan.weatherInfo">
          <el-icon><Sunny /></el-icon>
          <span>{{ dayPlan.weatherInfo.dayWeather || '未知' }}</span>
          <span>{{ dayPlan.weatherInfo.nightTemp || '--' }}°C ~ {{ dayPlan.weatherInfo.dayTemp || '--' }}°C</span>
        </div>
      </div>
      <div class="more-days" v-if="plan.dayPlans.length > 3">
        还有{{ plan.dayPlans.length - 3 }}天行程...
      </div>
    </div>

    <div class="budget-summary" v-if="plan.budgetSummary && plan.budgetSummary.length > 0">
      <div class="budget-title">预算明细</div>
      <div class="budget-items">
        <div class="budget-item" v-for="item in plan.budgetSummary" :key="item.category">
          <span>{{ item.category }}</span>
          <span class="budget-amount">¥{{ item.total }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Calendar, Location, Clock, Money, Place, Sunny } from '@element-plus/icons-vue'

const props = defineProps({
  plan: {
    type: Object,
    default: () => ({})
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['view-details'])

const viewDetails = () => {
  emit('view-details', props.plan)
}
</script>

<style scoped>
.trip-plan-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 16px;
  color: white;
  margin: 8px 0;
}

.trip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.trip-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
}

.trip-info {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.day-plans {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.day-plan-item {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.day-plan-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.day-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.day-title {
  font-weight: bold;
}

.day-theme {
  font-size: 12px;
  opacity: 0.9;
}

.attractions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.attraction-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.weather-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  opacity: 0.9;
}

.more-days {
  text-align: center;
  font-size: 12px;
  opacity: 0.8;
  margin-top: 8px;
}

.budget-summary {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px;
}

.budget-title {
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 14px;
}

.budget-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.budget-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.budget-amount {
  font-weight: bold;
}
</style>
