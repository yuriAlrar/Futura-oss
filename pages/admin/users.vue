<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">ユーザー管理</h1>
        <p class="text-gray-600">システム内のユーザーアカウントを管理します</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">
        新規ユーザー作成
      </v-btn>
    </div>

    <!-- フィルター -->
    <v-card class="mb-6">
      <v-card-text class="py-4">
        <div class="flex items-center space-x-4">
          <v-select v-model="selectedStatus" :items="statusOptions" label="ステータス" variant="outlined" density="compact"
            class="w-48" />
          <v-text-field v-model="searchQuery" label="検索" prepend-inner-icon="mdi-magnify" variant="outlined"
            density="compact" clearable class="w-64" />
          <v-btn variant="outlined" prepend-icon="mdi-refresh" @click="loadUsers">
            更新
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- ユーザーテーブル -->
    <v-card>
      <v-data-table-server v-model:items-per-page="itemsPerPage" :headers="headers" :items="users"
        :items-length="totalUsers" :loading="loading" :search="searchQuery" class="elevation-0"
        no-data-text="ユーザーが見つかりません" loading-text="読み込み中..." @update:options="handleOptionsUpdate">
        <template #[`item.status`]="{ item }">
          <v-chip :color="getStatusColor(item.status)" size="small" variant="flat">
            {{ getStatusText(item.status) }}
          </v-chip>
        </template>

        <template #[`item.profile_approved`]="{ item }">
          <v-chip :color="item.profile_approved ? 'success' : 'warning'" size="small" variant="flat">
            {{ item.profile_approved ? '承認済み' : '未承認' }}
          </v-chip>
        </template>

        <template #[`item.created_at`]="{ item }">
          {{ formatDate(item.created_at) }}
        </template>

        <template #[`item.actions`]="{ item }">
          <div class="flex items-center space-x-1">
            <v-btn size="small" variant="text" color="success" icon="mdi-cash-plus" @click="openDepositDialog(item)" />
            <v-btn size="small" variant="text" color="info" icon="mdi-information-outline"
              @click="openUserDetailsDialog(item)" />
            <v-btn v-if="item.status === 'active'" size="small" variant="text" color="warning" icon="mdi-pause"
              :disabled="item.user_id === user?.user_id" @click="suspendUser(item)" />
            <v-btn v-if="item.status === 'suspended'" size="small" variant="text" color="success" icon="mdi-play"
              @click="activateUser(item)" />
            <v-btn size="small" variant="text" color="info" icon="mdi-lock-reset"
              @click="openResetPasswordDialog(item)" />
            <v-btn v-if="item.status !== 'deleted'" size="small" variant="text" color="error" icon="mdi-delete"
              :disabled="item.user_id === user?.user_id" @click="deleteUser(item)" />
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- ユーザー作成ダイアログ -->
    <AdminCreateUserDialog v-model="showCreateDialog" @created="handleUserCreated" />

    <!-- パスワードリセットダイアログ -->
    <AdminResetPasswordDialog v-model="showResetPasswordDialog" :user="selectedUser" @reset="handlePasswordReset" />

    <!-- 入金ダイアログ -->
    <AdminCreateTransactionDialog v-model="showDepositDialog" :users="users"
      :preselected-user-id="selectedUserForDeposit?.user_id" default-transaction-type="deposit"
      default-reason="クレジットボーナス" @created="handleDepositCreated" />

    <!-- ユーザー詳細ダイアログ -->
    <AdminUserDetailsDialog v-model="showUserDetailsDialog" :user="selectedUserForDetails" />
  </div>
</template>

<script setup lang="ts">
import type { User, PaginatedResponse } from '~/types'

const logger = useLogger({ prefix: '[PAGE-ADMIN-USERS]' })
const apiClient = useApiClient()
const { user } = useAuth()

definePageMeta({
  middleware: 'auth',
  requireAdmin: true,
  layout: 'default'
})

useHead({
  title: 'ユーザー管理 - M・S CFD App'
})

const { showSuccess, showError } = useNotification()

// 状態（State）
const users = ref<User[]>([])
const totalUsers = ref(0)
const loading = ref(false)
const itemsPerPage = ref(20)
const page = ref(1)
const selectedStatus = ref('all')
const searchQuery = ref('')
const showCreateDialog = ref(false)
const showResetPasswordDialog = ref(false)
const selectedUser = ref<User | null>(null)
const showDepositDialog = ref(false)
const selectedUserForDeposit = ref<User | null>(null)
const showUserDetailsDialog = ref(false)
const selectedUserForDetails = ref<User | null>(null)

// オプション
const statusOptions = [
  { title: 'すべて', value: 'all' },
  { title: 'アクティブ', value: 'active' },
  { title: '停止中', value: 'suspended' },
  { title: '削除済み', value: 'deleted' }
]

// テーブルヘッダー
const headers = [
  { title: '名前', key: 'name', sortable: true },
  { title: 'メールアドレス', key: 'email', sortable: true },
  { title: 'ステータス', key: 'status', sortable: true },
  { title: 'プロフィール承認', key: 'profile_approved', sortable: true },
  { title: '作成日', key: 'created_at', sortable: true },
  { title: 'アクション', key: 'actions', sortable: false, width: 200 }
]

// 算出プロパティ（Computed）
// サーバーサイドフィルタリングに移行するため削除

// メソッド
const loadUsers = async () => {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: page.value,
      limit: itemsPerPage.value
    }
    if (selectedStatus.value && selectedStatus.value !== 'all') {
      params.status = selectedStatus.value
    }
    if (searchQuery.value && searchQuery.value.trim() !== '') {
      params.search = searchQuery.value.trim()
    }
    const response = await apiClient.get<PaginatedResponse<User>>('/admin/users', { params })
    const data = response.data!
    users.value = data.items
    totalUsers.value = data.total
  } catch (error) {
    logger.error('ユーザー一覧の読み込みに失敗しました:', error)
    showError('ユーザー一覧の取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const handleOptionsUpdate = (options: any) => {
  page.value = options.page
  itemsPerPage.value = options.itemsPerPage
  loadUsers()
}

watch([selectedStatus, searchQuery], () => {
  page.value = 1
  loadUsers()
})

const suspendUser = async (user: User) => {
  try {
    const response = await apiClient.post(`/admin/users/${user.user_id}/suspend`)
    if (response.success) {
      showSuccess(`${user.name}を停止しました`)
      await loadUsers()
    } else {
      showError(response.error || 'ユーザーの停止に失敗しました')
    }
  } catch (error) {
    logger.error('ユーザーの停止に失敗しました:', error)
    showError('ユーザーの停止に失敗しました')
  }
}

const activateUser = async (user: User) => {
  try {
    const response = await apiClient.post(`/admin/users/${user.user_id}/activate`)
    if (response.success) {
      showSuccess(`${user.name}を有効化しました`)
      await loadUsers()
    } else {
      showError(response.error || 'ユーザーの有効化に失敗しました')
    }
  } catch (error) {
    logger.error('ユーザーの有効化に失敗しました:', error)
    showError('ユーザーの有効化に失敗しました')
  }
}

const deleteUser = async (user: User) => {
  if (!confirm(`${user.name}を削除してもよろしいですか？この操作は取り消せません。`)) {
    return
  }

  try {
    const response = await apiClient.post(`/admin/users/${user.user_id}/delete`)
    if (response.success) {
      showSuccess(`${user.name}を削除しました`)
      await loadUsers()
    } else {
      showError(response.error || 'ユーザーの削除に失敗しました')
    }
  } catch (error) {
    logger.error('ユーザーの削除に失敗しました:', error)
    showError('ユーザーの削除に失敗しました')
  }
}

const openResetPasswordDialog = (user: User) => {
  selectedUser.value = user
  showResetPasswordDialog.value = true
}

const handleUserCreated = () => {
  showCreateDialog.value = false
  loadUsers()
}

const handlePasswordReset = () => {
  showResetPasswordDialog.value = false
  selectedUser.value = null
}

const openDepositDialog = (user: User) => {
  selectedUserForDeposit.value = user
  showDepositDialog.value = true
}

const handleDepositCreated = () => {
  showDepositDialog.value = false
  selectedUserForDeposit.value = null
  loadUsers()
}

const openUserDetailsDialog = (user: User) => {
  selectedUserForDetails.value = user
  showUserDetailsDialog.value = true
}

// ユーティリティ関数
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
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// マウント時にユーザーを読み込む
onMounted(() => {
  loadUsers()
})
</script>