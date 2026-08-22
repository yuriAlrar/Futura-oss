<template>
  <v-dialog :model-value="modelValue" max-width="900" @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="user">
      <v-card-title class="text-lg font-semibold flex items-center justify-between">
        <span>ユーザー詳細</span>
        <v-chip :color="user.profile_approved ? 'success' : 'warning'" size="small" variant="flat">
          {{ user.profile_approved ? '承認済み' : '承認待ち' }}
        </v-chip>
      </v-card-title>

      <v-card-text>
        <div class="space-y-6">
          <!-- Basic Information -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">基本情報</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">氏名</label>
                <p class="mt-1 text-gray-900">{{ user.name }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-600">メールアドレス</label>
                <p class="mt-1 text-gray-900">{{ user.email }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-600">電話番号</label>
                <p class="mt-1 text-gray-900">{{ user.phone_number }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-600">ステータス</label>
                <v-chip :color="getStatusColor(user.status)" size="small" variant="flat" class="mt-1">
                  {{ getStatusText(user.status) }}
                </v-chip>
              </div>
              <div class="md:col-span-2">
                <label class="text-sm font-medium text-gray-600">住所</label>
                <p class="mt-1 text-gray-900">{{ user.address }}</p>
              </div>
            </div>
          </div>

          <!-- Profile Image -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">免許証画像</h3>
            <div v-if="user.profile_image_url" class="space-y-4">
              <div class="border rounded-lg p-4 bg-gray-50">
                <img :src="user.profile_image_url" :alt="`${user.name}の免許証`"
                  class="max-w-full h-auto max-h-64 mx-auto rounded-lg shadow-md" @error="handleImageError">
              </div>
              <div class="flex items-center justify-center space-x-2">
                <v-btn variant="outlined" size="small" prepend-icon="mdi-fullscreen" @click="viewFullImage">
                  拡大表示
                </v-btn>
                <v-btn variant="outlined" size="small" prepend-icon="mdi-download" @click="downloadImage">
                  ダウンロード
                </v-btn>
              </div>
            </div>
            <div v-else class="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Icon name="mdi:image-off" class="text-4xl text-gray-400 mb-2" />
              <p class="text-gray-500">免許証画像がアップロードされていません</p>
            </div>
          </div>

          <!-- Account Information -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">アカウント情報</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">ユーザーID</label>
                <code class="block mt-1 text-xs bg-gray-100 p-2 rounded font-mono">
                  {{ user.user_id }}
                </code>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-600">作成日時</label>
                <p class="mt-1 text-gray-900">{{ formatDate(user.created_at) }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-600">更新日時</label>
                <p class="mt-1 text-gray-900">{{ formatDate(user.updated_at) }}</p>
              </div>
            </div>
          </div>

          <!-- Rejection Reason (if exists) -->
          <div v-if="user.rejection_reason">
            <h3 class="text-lg font-medium text-gray-900 mb-4">承認取り消し理由</h3>
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
              <p class="text-sm text-red-800">{{ user.rejection_reason }}</p>
            </div>
          </div>

          <!-- Dashboard Information -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">ダッシュボード情報</h3>
            <div v-if="loadingDashboard" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" />
              <p class="text-sm text-gray-500 mt-2">読み込み中...</p>
            </div>
            <div v-else-if="dashboardData" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label class="text-sm font-medium text-blue-600">現在の残高</label>
                <p class="mt-1 text-lg font-bold text-blue-900 font-mono">
                  ¥{{ formatNumber(dashboardData.currentValue) }}
                </p>
              </div>
              <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                <label class="text-sm font-medium text-green-600">入金元本</label>
                <p class="mt-1 text-lg font-bold text-green-900 font-mono">
                  ¥{{ formatNumber(dashboardData.depositPrincipal) }}
                </p>
              </div>
              <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <label class="text-sm font-medium text-orange-600">出金額</label>
                <p class="mt-1 text-lg font-bold text-orange-900 font-mono">
                  ¥{{ formatNumber(dashboardData.withdrawalTotal) }}
                </p>
              </div>
              <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <label class="text-sm font-medium text-purple-600">クレジットボーナス</label>
                <p class="mt-1 text-lg font-bold text-purple-900 font-mono">
                  ¥{{ formatNumber(dashboardData.creditBonus) }}
                </p>
              </div>
              <div class="md:col-span-2" :class="[
                dashboardData.netProfit > 0 ? 'bg-green-50 border-green-200' :
                  dashboardData.netProfit < 0 ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200',
                'border rounded-lg p-4'
              ]">
                <label class="text-sm font-medium" :class="[
                  dashboardData.netProfit > 0 ? 'text-green-600' :
                    dashboardData.netProfit < 0 ? 'text-red-600' :
                      'text-gray-600'
                ]">純利益</label>
                <p class="mt-1 text-lg font-bold font-mono" :class="[
                  dashboardData.netProfit > 0 ? 'text-green-900' :
                    dashboardData.netProfit < 0 ? 'text-red-900' :
                      'text-gray-900'
                ]">
                  ¥{{ formatNumber(dashboardData.netProfit) }}
                </p>
                <p class="text-xs text-gray-500 mt-1">残高 - 元本 + 出金額</p>
              </div>
            </div>
            <div v-else class="text-center py-8 bg-gray-50 rounded-lg">
              <Icon name="mdi:chart-line" class="text-4xl text-gray-400 mb-2" />
              <p class="text-gray-500">ダッシュボード情報を取得できませんでした</p>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">
          閉じる
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { User, DashboardData } from '~/types'
import { formatNumber } from '~/utils/format'

// Props & Emits
const props = defineProps<{
  modelValue: boolean
  user: User | null
}>()

const _emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { showError } = useNotification()
const apiClient = useApiClient()
const logger = useLogger({ prefix: '[AdminUserDetailsDialog]' })

// State
const dashboardData = ref<DashboardData | null>(null)
const loadingDashboard = ref(false)

// Methods
const loadDashboardData = async () => {
  if (!props.user?.user_id) return

  loadingDashboard.value = true
  try {
    const response = await apiClient.get<DashboardData>(`/admin/users/${props.user.user_id}/dashboard`)
    dashboardData.value = response.data!
  } catch (error) {
    logger.error('ダッシュボードデータの読み込みに失敗しました:', error)
    showError('ダッシュボードデータの取得に失敗しました')
  } finally {
    loadingDashboard.value = false
  }
}

const viewFullImage = () => {
  if (props.user?.profile_image_url) {
    window.open(props.user.profile_image_url, '_blank')
  }
}

const downloadImage = () => {
  if (props.user?.profile_image_url) {
    const link = document.createElement('a')
    link.href = props.user.profile_image_url
    link.download = `license_${props.user.name}_${props.user.user_id}.jpg`
    link.click()
  }
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
  showError('画像の読み込みに失敗しました')
}

// Utility functions
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'suspended': return 'warning'
    case 'deleted': return 'error'
    default: return 'grey'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return 'アクティブ'
    case 'suspended': return '停止中'
    case 'deleted': return '削除済み'
    default: return status
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Watch for dialog open/close
watch(() => props.modelValue, (newValue) => {
  if (newValue && props.user) {
    loadDashboardData()
  } else {
    // Reset dashboard data when dialog closes
    dashboardData.value = null
  }
})
</script>