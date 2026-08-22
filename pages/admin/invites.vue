<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">招待コード管理</h1>
        <p class="text-gray-600">新規登録用の招待リンクを発行・管理します。リンクは1回使用すると失効します</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" :loading="creating" @click="createInvite">
        招待リンクを発行
      </v-btn>
    </div>

    <v-card>
      <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900">招待リンク一覧</h3>
        <v-btn variant="outlined" size="small" prepend-icon="mdi-refresh" @click="loadInvites">
          更新
        </v-btn>
      </v-card-title>

      <v-data-table :headers="headers" :items="invites" :loading="loading" :items-per-page="20" class="elevation-0"
        no-data-text="招待コードがありません" loading-text="読み込み中...">
        <template #[`item.status`]="{ item }">
          <v-chip :color="getStatusColor(item.status)" size="small" variant="flat">
            {{ getStatusText(item.status) }}
          </v-chip>
        </template>

        <template #[`item.link`]="{ item }">
          <div v-if="item.status === 'active'" class="flex items-center gap-2">
            <code class="text-xs bg-gray-100 px-2 py-1 rounded max-w-xs truncate">{{ getInviteLink(item.invite_code) }}</code>
            <v-btn size="small" variant="text" icon="mdi-content-copy" @click="copyLink(item.invite_code)" />
          </div>
          <span v-else class="text-gray-400 text-sm">-</span>
        </template>

        <template #[`item.created_at`]="{ item }">
          {{ formatDate(item.created_at) }}
        </template>

        <template #[`item.consumed_at`]="{ item }">
          {{ item.consumed_at ? formatDate(item.consumed_at) : '-' }}
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn v-if="item.status === 'active'" size="small" variant="text" color="error" prepend-icon="mdi-cancel"
            @click="revokeInviteItem(item)">
            失効
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import type { Invite } from '~/types'

definePageMeta({
  middleware: 'auth',
  requireAdmin: true,
  layout: 'default'
})

useHead({
  title: '招待コード管理 - M・S CFD App'
})

const logger = useLogger({ prefix: '[AdminInvites]' })
const { showSuccess, showError } = useNotification()
const apiClient = useApiClient()

const invites = ref<Invite[]>([])
const loading = ref(false)
const creating = ref(false)

const headers = [
  { title: 'ステータス', key: 'status', sortable: true },
  { title: '招待リンク', key: 'link', sortable: false },
  { title: '発行日時', key: 'created_at', sortable: true },
  { title: '使用日時', key: 'consumed_at', sortable: true },
  { title: 'アクション', key: 'actions', sortable: false, width: 120 }
]

const getInviteLink = (code: string) => {
  if (import.meta.client) {
    return `${window.location.origin}/register?code=${code}`
  }
  return `/register?code=${code}`
}

const copyLink = async (code: string) => {
  try {
    await navigator.clipboard.writeText(getInviteLink(code))
    showSuccess('リンクをコピーしました')
  } catch (error) {
    logger.error('クリップボードへのコピーに失敗しました:', error)
    showError('コピーに失敗しました')
  }
}

const loadInvites = async () => {
  loading.value = true
  try {
    const response = await apiClient.get<{ items: Invite[] }>('/admin/invites')
    invites.value = response.data?.items || []
  } catch (error) {
    logger.error('招待コード一覧の読み込みに失敗しました:', error)
    showError('招待コード一覧の取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const createInvite = async () => {
  creating.value = true
  try {
    await apiClient.post('/admin/invites')
    showSuccess('招待リンクを発行しました')
    await loadInvites()
  } catch (error) {
    logger.error('招待コードの発行に失敗しました:', error)
    showError('招待コードの発行に失敗しました')
  } finally {
    creating.value = false
  }
}

const revokeInviteItem = async (invite: Invite) => {
  if (!confirm('この招待リンクを失効させますか？')) return

  try {
    await apiClient.delete(`/admin/invites/${invite.invite_code}`)
    showSuccess('招待リンクを失効しました')
    await loadInvites()
  } catch (error) {
    logger.error('招待コードの失効に失敗しました:', error)
    showError('招待コードの失効に失敗しました')
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'consumed': return 'info'
    case 'revoked': return 'grey'
    default: return 'grey'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return '有効'
    case 'consumed': return '使用済み'
    case 'revoked': return '失効済み'
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

onMounted(() => {
  loadInvites()
})
</script>
