<template>
  <div id="app">
    <!-- Show main app only after auth initialization -->
    <div v-show="isInitialized">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
      
      <!-- Global notification component -->
      <CommonNotificationSnackbar />
    </div>
    
    <!-- Global loading screen during auth initialization -->
    <div v-show="!isInitialized" class="loading-container">
      <div class="loading-card">
        <div class="loading-icon-wrapper">
          <div class="loading-icon"/>
        </div>
        <div class="loading-text-wrapper">
          <p class="loading-text">認証状態を確認中...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Global auth initialization and state
const { isInitialized, initAuth } = useAuth()
const logger = useLogger({ prefix: '[APP]' })

// Initialize auth once globally on client side
onMounted(async () => {
  if (import.meta.client && !isInitialized.value) {
    logger.start('=== アプリケーション認証初期化開始 ===')
    try {
      await initAuth()
      logger.success('アプリケーション認証初期化が正常に完了しました')
    } catch (error) {
      logger.error('アプリケーション認証初期化に失敗しました:', error)
    }
    logger.success('=== アプリケーション認証初期化完了 ===')
  }
})
</script>

<style>
html, body {
  font-family: 'Inter', sans-serif;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px;
  border-radius: 16px;
  background-color: white;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.1);
  min-width: 240px;
  border: 1px solid #e2e8f0;
  animation: none;
  transform: none;
}

.loading-icon-wrapper {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-text-wrapper {
  animation: none !important;
  transform: none !important;
}

.loading-icon {
  width: 48px;
  height: 48px;
  border: 4px solid #fed7aa;
  border-top: 4px solid #f97316;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  position: relative;
}

.loading-icon::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  right: 2px;
  bottom: 2px;
  border: 2px solid transparent;
  border-top: 2px solid #fb923c;
  border-radius: 50%;
  animation: spin 0.8s linear infinite reverse;
}

.loading-text {
  font-size: 16px;
  color: #334155;
  margin: 0;
  font-weight: 500;
  font-family: 'Noto Sans JP', 'Kanit', sans-serif;
  animation: none !important;
  transform: none !important;
  animation-name: none !important;
  animation-duration: 0s !important;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>