<template>
  <!-- AI聊天抽屉 -->
  <el-drawer v-model="visible" title="小虔助手" direction="rtl" size="400px" :with-header="true">
    <div class="ai-chat">
      <!-- 聊天消息容器 -->
      <div class="chat-messages" ref="messagesContainer">
        <!-- 消息列表 -->
        <div 
          class="message" 
          v-for="(msg, index) in messages" 
          :key="index"
          :class="msg.role"
        >
          <div class="message-avatar">
            <!-- 助手头像 -->
            <el-avatar v-if="msg.role === 'assistant'" :size="32">
              <el-icon><ChatDotRound /></el-icon>
            </el-avatar>
            <!-- 用户头像 -->
            <el-avatar v-else :size="32">{{ (userStore.nickname || 'U').charAt(0) }}</el-avatar>
          </div>
          <div class="message-content">
            <div class="message-text">{{ msg.content }}</div>
          </div>
        </div>
        
        <!-- 加载状态 -->
        <div class="message assistant" v-if="loading">
          <div class="message-avatar">
            <el-avatar :size="32">
              <el-icon><ChatDotRound /></el-icon>
            </el-avatar>
          </div>
          <div class="message-content">
            <div class="message-text loading">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 快速问题 -->
      <div class="quick-questions">
        <el-tag 
          v-for="q in quickQuestions" 
          :key="q" 
          @click="sendQuickQuestion(q)"
          class="quick-tag"
        >
          {{ q }}
        </el-tag>
      </div>
      
      <!-- 聊天输入框 -->
      <div class="chat-input">
        <el-input 
          v-model="inputMessage" 
          placeholder="输入消息..." 
          @keyup.enter="sendMessage"
        >
          <template #append>
            <el-button @click="sendMessage" :loading="loading">
              <el-icon><Position /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
// 导入Vue核心功能
import { ref, watch, nextTick } from 'vue'
// 导入AI相关API
import { aiApi } from '@/api'
// 导入用户状态管理
import { useUserStore } from '@/stores/user'

// 定义组件属性
const props = defineProps({
  modelValue: Boolean // 控制抽屉的显示/隐藏
})

// 定义事件
const emit = defineEmits(['update:modelValue'])

// 用户状态
const userStore = useUserStore()
// 抽屉显示状态
const visible = ref(false)
// 输入消息
const inputMessage = ref('')
// 加载状态
const loading = ref(false)
// 消息列表
const messages = ref([])
// 消息容器引用
const messagesContainer = ref(null)
// 会话ID
const sessionId = ref('')

// 快速问题列表
const quickQuestions = [
  '如何规划骑行路线？',
  '附近有哪些红色景点？',
  '如何上报道路问题？',
  '骑行安全注意事项'
]

// 监听外部控制抽屉显示/隐藏
watch(() => props.modelValue, (val) => {
  visible.value = val
})

// 监听抽屉状态变化，通知父组件
watch(visible, (val) => {
  emit('update:modelValue', val)
})

// 发送消息
async function sendMessage() {
  if (!inputMessage.value.trim() || loading.value) return
  
  const userMessage = inputMessage.value.trim()
  // 添加用户消息到列表
  messages.value.push({ role: 'user', content: userMessage })
  // 清空输入框
  inputMessage.value = ''
  
  // 滚动到底部
  scrollToBottom()
  
  // 开始加载
  loading.value = true
  try {
    // 调用AI聊天API
    const res = await aiApi.chat({
      message: userMessage,
      sessionId: sessionId.value
    })
    
    if (res.code === 200) {
      // 更新会话ID
      sessionId.value = res.data.sessionId
      // 添加AI回复到列表
      messages.value.push({ role: 'assistant', content: res.data.response })
    }
  } catch {
    // 错误处理
    messages.value.push({ role: 'assistant', content: '抱歉，服务暂时不可用，请稍后再试。' })
  } finally {
    // 结束加载
    loading.value = false
    // 滚动到底部
    scrollToBottom()
  }
}

// 发送快速问题
function sendQuickQuestion(question) {
  inputMessage.value = question
  sendMessage()
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>

<style lang="scss" scoped>
/* AI聊天容器 */
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 聊天消息区域 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  
  .message {
    display: flex;
    margin-bottom: 15px;
    
    /* 用户消息样式 */
    &.user {
      flex-direction: row-reverse;
      
      .message-content {
        align-items: flex-end;
      }
      
      .message-text {
        background: #409eff;
        color: #fff;
      }
    }
    
    /* 助手消息样式 */
    &.assistant {
      .message-text {
        background: #f5f7fa;
      }
    }
    
    /* 头像 */
    .message-avatar {
      flex-shrink: 0;
    }
    
    /* 消息内容 */
    .message-content {
      display: flex;
      flex-direction: column;
      margin: 0 10px;
      
      .message-text {
        max-width: 260px;
        padding: 10px 15px;
        border-radius: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        
        /* 加载动画 */
        &.loading {
          display: flex;
          gap: 4px;
          
          span {
            width: 8px;
            height: 8px;
            background: #409eff;
            border-radius: 50%;
            animation: bounce 1s infinite;
            
            &:nth-child(2) { animation-delay: 0.2s; }
            &:nth-child(3) { animation-delay: 0.4s; }
          }
        }
      }
    }
  }
}

/* 加载动画 */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* 快速问题区域 */
.quick-questions {
  padding: 10px;
  border-top: 1px solid #eee;
  
  .quick-tag {
    margin: 5px;
    cursor: pointer;
    
    &:hover {
      opacity: 0.8;
    }
  }
}

/* 聊天输入区域 */
.chat-input {
  padding: 10px;
  border-top: 1px solid #eee;
}
</style>
