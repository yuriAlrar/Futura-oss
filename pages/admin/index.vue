<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">管理者ダッシュボード</h1>
        <p class="text-gray-600">システム全体の管理機能にアクセスできます</p>
      </div>
      <v-btn variant="outlined" prepend-icon="mdi-refresh" :loading="loading" @click="loadDashboardData">
        更新
      </v-btn>
    </div>



    <!-- Dashboard Details -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <!-- Recent Transaction Requests -->
      <v-card v-if="canViewTransactionRequests">
        <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
          <div class="flex items-center">
            <Icon name="mdi:bank-transfer" class="text-xl mr-2" />
            <h3 class="text-lg font-semibold text-gray-900">
              承認待ち入金リクエスト
              <span v-if="dashboardData?.stats" class="text-sm font-normal text-gray-600 ml-2">
                ({{ dashboardData.stats.pendingTransactionRequests }}件)
              </span>
            </h3>
          </div>
          <v-btn variant="text" color="primary" size="small" to="/admin/transaction-requests">
            すべて見る
          </v-btn>
        </v-card-title>
        <v-card-text class="p-6">
          <div v-if="dashboardData?.recentTransactionRequests.length" class="space-y-4">
            <div v-for="request in dashboardData.recentTransactionRequests" :key="request.transaction_id"
              class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="text-sm font-medium text-gray-900">{{ request.user_name }}</span>
                  <span class="text-xs text-gray-500">({{ request.user_email }})</span>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-mono font-semibold text-green-600">
                    +¥{{ formatNumber(request.amount) }}
                  </span>
                  <span class="text-xs text-gray-500">{{ formatDate(request.requested_at || request.timestamp) }}</span>
                </div>
              </div>
              <v-btn size="small" variant="outlined" color="primary" :to="`/admin/transaction-requests`">
                詳細
              </v-btn>
            </div>
          </div>
          <div v-else class="text-center py-8">
            <Icon name="mdi:bank-transfer-in" class="text-4xl text-gray-400 mb-2" />
            <p class="text-gray-500">承認待ちの入金リクエストはありません</p>
          </div>
        </v-card-text>
      </v-card>

      <!-- Pending Users -->
      <v-card v-if="canViewUsers">
        <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
          <div class="flex items-center">
            <Icon name="mdi:account-clock" class="text-xl mr-2" />
            <h3 class="text-lg font-semibold text-gray-900">
              承認待ちユーザー
              <span v-if="dashboardData?.stats" class="text-sm font-normal text-gray-600 ml-2">
                ({{ dashboardData.stats.pendingUsers }}件)
              </span>
            </h3>
          </div>
          <v-btn variant="text" color="primary" size="small" to="/admin/users">
            すべて見る
          </v-btn>
        </v-card-title>
        <v-card-text class="p-6">
          <div v-if="dashboardData?.pendingUsers.length" class="space-y-4">
            <div v-for="user in dashboardData.pendingUsers" :key="user.user_id"
              class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="text-sm font-medium text-gray-900">{{ user.name }}</span>
                  <v-chip size="x-small" color="orange" variant="flat">承認待ち</v-chip>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-sm text-gray-600">{{ user.email }}</span>
                  <span class="text-xs text-gray-500">{{ formatDate(user.created_at) }}</span>
                </div>
              </div>
              <v-btn size="small" variant="outlined" color="primary" :to="`/admin/users`">
                詳細
              </v-btn>
            </div>
          </div>
          <div v-else class="text-center py-8">
            <Icon name="mdi:account-check" class="text-4xl text-gray-400 mb-2" />
            <p class="text-gray-500">承認待ちのユーザーはいません</p>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <!-- Management Functions -->
      <v-card>
        <v-card-title class="flex items-center">
          <Icon name="mdi:cog" class="text-xl mr-2" />
          システム管理
        </v-card-title>
        <v-card-text class="space-y-3">
          <div v-for="item in managementItems" :key="item.to"
            class="flex items-center p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
            @click="navigateTo(item.to)">
            <div class="p-2 rounded-lg" :class="item.bgColor">
              <Icon :name="item.icon" class="text-xl" :class="item.iconColor" />
            </div>
            <div class="ml-3 flex-1">
              <h3 class="text-sm font-medium text-gray-900">{{ item.title }}</h3>
              <p class="text-xs text-gray-500">{{ item.description }}</p>
            </div>
            <Icon name="mdi:chevron-right" class="text-gray-400" />
          </div>
        </v-card-text>
      </v-card>

      <!-- Recent Activities -->
      <v-card>
        <v-card-title class="flex items-center">
          <Icon name="mdi:history" class="text-xl mr-2" />
          最近のアクティビティ
        </v-card-title>
        <v-card-text>
          <div v-if="!dashboardData?.recentActivities.length" class="text-center py-8">
            <Icon name="mdi:information-outline" class="text-4xl text-gray-400 mb-2" />
            <p class="text-gray-500">アクティビティがありません</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="activity in dashboardData.recentActivities" :key="activity.id"
              class="flex items-start space-x-3 p-3 border rounded-lg">
              <div class="p-2 rounded-lg" :class="getActivityStyle(activity.type).bgColor">
                <Icon :name="getActivityStyle(activity.type).icon" class="text-sm"
                  :class="getActivityStyle(activity.type).iconColor" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-gray-900">{{ activity.message }}</p>
                <p class="text-xs text-gray-500">{{ formatDate(activity.timestamp) }}</p>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- System Sync Section -->
    <v-card class="mt-8">
      <v-card-title class="flex items-center">
        <Icon name="mdi:sync" class="text-xl mr-2" />
        システム同期
      </v-card-title>
      <v-card-subtitle>
        アプリデプロイ直後や構成変更時にデータベースとCognitoの状態を同期します
      </v-card-subtitle>
      <v-card-text>
        <div class="space-y-4">
          <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="flex items-start">
              <Icon name="mdi:alert-circle" class="text-yellow-600 text-xl mt-0.5 mr-3" />
              <div>
                <h4 class="text-sm font-medium text-yellow-800 mb-1">同期について</h4>
                <p class="text-sm text-yellow-700">
                  この機能はCognito User Poolの情報をDynamoDBのusersテーブルとpermissionsテーブルに同期します。
                  初期セットアップ時や構成変更後にのみ実行してください。
                </p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 class="text-sm font-medium text-gray-900 mb-1">Cognito → DynamoDB 同期</h4>
              <p class="text-sm text-gray-500">
                Cognitoユーザープールからユーザーと権限情報をDynamoDBに同期します
              </p>
            </div>
            <v-btn color="primary" variant="outlined" prepend-icon="mdi-sync" :loading="syncLoading"
              @click="syncCognitoData">
              同期実行
            </v-btn>
          </div>

          <!-- Sync Results -->
          <div v-if="syncResults" class="p-4 border rounded-lg bg-green-50">
            <div class="flex items-start">
              <Icon name="mdi:check-circle" class="text-green-600 text-xl mt-0.5 mr-3" />
              <div>
                <h4 class="text-sm font-medium text-green-800 mb-2">同期完了</h4>
                <div class="text-sm text-green-700 space-y-1">
                  <p>ユーザー: {{ syncResults.users.synced }}人同期 (エラー: {{ syncResults.users.errors }}件)</p>
                  <p>権限: {{ syncResults.permissions.synced }}件同期 (エラー: {{ syncResults.permissions.errors }}件)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { formatNumber } from '~/utils/format'
import type { AdminDashboardData } from '~/types'

// Page meta
definePageMeta({
  middleware: 'auth',
  requireAdmin: true,
  layout: 'default'
})

const logger = useLogger({ prefix: '[AdminDashboard]' })
const { showSuccess, showError } = useNotification()
const { user } = useAuth()
const apiClient = useApiClient()

const loading = ref(false)
const syncLoading = ref(false)
const syncResults = ref<{
  users: { synced: number; errors: number }
  permissions: { synced: number; errors: number }
} | null>(null)

// Dashboard data state
const dashboardData = ref<AdminDashboardData | null>(null)

// Permission checks
const canViewTransactionRequests = computed(() => {
  return user.value?.permissions?.includes('transaction:approve') || false
})

const canViewUsers = computed(() => {
  return user.value?.permissions?.includes('user:approve') || false
})

// Legacy computed property removed - stats now displayed directly in titles

// Activity interface は不要（types/index.tsで定義済み）

const managementItems = [
  {
    title: 'ユーザー管理',
    description: 'ユーザーアカウントの作成、編集、削除',
    icon: 'mdi:account-group',
    to: '/admin/users',
    bgColor: 'bg-blue-100',
    iconColor: 'text-blue-600'
  },
  {
    title: 'グループ管理',
    description: 'ユーザーグループと権限の管理',
    icon: 'mdi:shield-account',
    to: '/admin/groups',
    bgColor: 'bg-purple-100',
    iconColor: 'text-purple-600'
  },
  {
    title: '相場価格設定',
    description: '相場価格の履歴閲覧（現在は編集不可）',
    icon: 'mdi:chart-line',
    to: '/admin/rates',
    bgColor: 'bg-green-100',
    iconColor: 'text-green-600'
  },
  {
    title: '入出金管理',
    description: '全ユーザーの取引結果管理',
    icon: 'mdi:bank-transfer',
    to: '/admin/transactions',
    bgColor: 'bg-orange-100',
    iconColor: 'text-orange-600'
  },
  {
    title: 'プロフィール承認',
    description: 'ユーザープロフィール変更の承認処理',
    icon: 'mdi:check-circle',
    to: '/admin/approvals',
    bgColor: 'bg-red-100',
    iconColor: 'text-red-600'
  },
  {
    title: '一括資産調整',
    description: '全ユーザーまたはセグメント単位で資産残高を一括で増減',
    icon: 'mdi:cash-multiple',
    to: '/admin/batch-operations',
    bgColor: 'bg-yellow-100',
    iconColor: 'text-yellow-600'
  },
  {
    title: 'セグメント管理',
    description: '運用セグメントの作成と所属ユーザーの管理',
    icon: 'mdi:tag-multiple',
    to: '/admin/segments',
    bgColor: 'bg-teal-100',
    iconColor: 'text-teal-600'
  },
  {
    title: '招待コード管理',
    description: '新規登録用の招待リンクの発行・失効',
    icon: 'mdi:account-plus',
    to: '/admin/invites',
    bgColor: 'bg-indigo-100',
    iconColor: 'text-indigo-600'
  }
]

// Load dashboard data
const loadDashboardData = async () => {
  loading.value = true
  try {
    logger.info('管理者ダッシュボードデータの読み込み開始')

    // 新しい統合されたダッシュボードAPIエンドポイントを呼び出し
    const response = await apiClient.get<AdminDashboardData>('/admin/dashboard')

    dashboardData.value = response.data!
    logger.info('管理者ダッシュボードデータの読み込み完了:', {
      stats: response.data!.stats,
      transactionRequests: response.data!.recentTransactionRequests.length,
      pendingUsers: response.data!.pendingUsers.length
    })

  } catch (error) {
    logger.error('ダッシュボードデータの読み込みにエラーが発生しました:', error)
    showError('ダッシュボードデータの取得に失敗しました')
    // エラー時はデフォルト値を設定
    dashboardData.value = {
      stats: {
        pendingTransactionRequests: 0,
        pendingUsers: 0
      },
      recentTransactionRequests: [],
      pendingUsers: [],
      recentActivities: []
    }
  } finally {
    loading.value = false
  }
}

// Cognito sync functionality
const syncCognitoData = async () => {
  syncLoading.value = true
  syncResults.value = null

  try {
    logger.info('Cognito同期開始')

    const response = await apiClient.post<{
      syncResults: {
        users: { synced: number; errors: number }
        permissions: { synced: number; errors: number }
      }
      message: string
    }>('/admin/system/sync-cognito')

    syncResults.value = response.data!.syncResults
    showSuccess(response.data!.message)
    logger.info('Cognito同期完了:', response.data!.syncResults)

    // 同期後にダッシュボードデータを再読み込み
    await loadDashboardData()
  } catch (error) {
    logger.error('Cognito同期エラー:', error)
    showError('Cognito同期に失敗しました')
  } finally {
    syncLoading.value = false
  }
}


const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getActivityStyle = (type: 'transaction' | 'user_registration' | 'login') => {
  switch (type) {
    case 'transaction':
      return {
        bgColor: 'bg-green-100',
        icon: 'mdi:bank-transfer',
        iconColor: 'text-green-600'
      }
    case 'user_registration':
      return {
        bgColor: 'bg-blue-100',
        icon: 'mdi:account-plus',
        iconColor: 'text-blue-600'
      }
    case 'login':
      return {
        bgColor: 'bg-purple-100',
        icon: 'mdi:login',
        iconColor: 'text-purple-600'
      }
    default:
      return {
        bgColor: 'bg-gray-100',
        icon: 'mdi:information',
        iconColor: 'text-gray-600'
      }
  }
}

// Initialize page
onMounted(() => {
  loadDashboardData()
})
</script>