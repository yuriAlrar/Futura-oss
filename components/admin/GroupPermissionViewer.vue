<template>
  <v-dialog 
    :model-value="modelValue" 
    max-width="700"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="px-6 py-4 border-b">
        <h3 class="text-lg font-semibold text-gray-900">
          グループ権限詳細: {{ group?.GroupName }}
        </h3>
        <p class="text-sm text-gray-600 mt-1">
          {{ group?.Description || 'グループの説明なし' }}
        </p>
      </v-card-title>

      <v-card-text class="px-6 py-6">
        <div class="space-y-6">
          <!-- Group Info -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-md font-medium text-gray-900">グループ情報</h4>
              <v-chip
                :color="group?.GroupName === 'administrator' ? 'warning' : 'primary'"
                size="small"
                variant="flat"
              >
                <Icon 
                  :name="group?.GroupName === 'administrator' ? 'mdi:shield' : 'mdi:account-group'" 
                  class="mr-1" 
                />
                {{ group?.GroupName === 'administrator' ? '管理者グループ' : 'カスタムグループ' }}
              </v-chip>
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-600">優先度:</span>
                <span class="ml-2 font-medium">{{ group?.Precedence || 0 }}</span>
              </div>
              <div>
                <span class="text-gray-600">作成日:</span>
                <span class="ml-2 font-medium">{{ formatDate(group?.CreationDate) }}</span>
              </div>
            </div>
          </div>

          <!-- Permissions -->
          <div>
            <h4 class="text-md font-medium text-gray-900 mb-4">付与される権限</h4>
            
            <!-- Administrator Group Permissions -->
            <div v-if="group?.GroupName === 'administrator'" class="space-y-4">
              <!-- User Management -->
              <div class="border rounded-lg p-4">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:account-group" class="text-xl text-blue-500 mr-2" />
                  <h5 class="font-medium text-gray-900">ユーザー管理</h5>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <v-chip
                    v-for="permission in userPermissions"
                    :key="permission.key"
                    color="success"
                    size="small"
                    variant="outlined"
                  >
                    <Icon :name="permission.icon" class="mr-1" />
                    {{ permission.label }}
                  </v-chip>
                </div>
              </div>

              <!-- Admin Functions -->
              <div class="border rounded-lg p-4">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:shield-check" class="text-xl text-orange-500 mr-2" />
                  <h5 class="font-medium text-gray-900">管理機能</h5>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <v-chip
                    v-for="permission in adminPermissions"
                    :key="permission.key"
                    color="warning"
                    size="small"
                    variant="outlined"
                  >
                    <Icon :name="permission.icon" class="mr-1" />
                    {{ permission.label }}
                  </v-chip>
                </div>
              </div>

              <!-- Transaction & Market -->
              <div class="border rounded-lg p-4">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:bank" class="text-xl text-green-500 mr-2" />
                  <h5 class="font-medium text-gray-900">取引・市場管理</h5>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <v-chip
                    v-for="permission in transactionPermissions"
                    :key="permission.key"
                    color="success"
                    size="small"
                    variant="outlined"
                  >
                    <Icon :name="permission.icon" class="mr-1" />
                    {{ permission.label }}
                  </v-chip>
                </div>
              </div>

              <!-- Basic User Permissions -->
              <div class="border rounded-lg p-4">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:account" class="text-xl text-purple-500 mr-2" />
                  <h5 class="font-medium text-gray-900">基本ユーザー機能</h5>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <v-chip
                    v-for="permission in basicPermissions"
                    :key="permission.key"
                    color="primary"
                    size="small"
                    variant="outlined"
                  >
                    <Icon :name="permission.icon" class="mr-1" />
                    {{ permission.label }}
                  </v-chip>
                </div>
              </div>
            </div>

            <!-- Standard User Group Permissions -->
            <div v-else class="space-y-4">
              <div class="border rounded-lg p-4">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:account" class="text-xl text-blue-500 mr-2" />
                  <h5 class="font-medium text-gray-900">基本ユーザー機能</h5>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <v-chip
                    v-for="permission in basicPermissions"
                    :key="permission.key"
                    color="primary"
                    size="small"
                    variant="outlined"
                  >
                    <Icon :name="permission.icon" class="mr-1" />
                    {{ permission.label }}
                  </v-chip>
                </div>
              </div>

              <!-- Restrictions -->
              <div class="border border-red-200 rounded-lg p-4 bg-red-50">
                <div class="flex items-center mb-3">
                  <Icon name="mdi:block-helper" class="text-xl text-red-500 mr-2" />
                  <h5 class="font-medium text-red-700">制限事項</h5>
                </div>
                <div class="text-sm text-red-600">
                  <ul class="list-disc list-inside space-y-1">
                    <li>管理者機能へのアクセスは不可</li>
                    <li>ユーザー管理機能は使用不可</li>
                    <li>システム設定の変更は不可</li>
                    <li>他ユーザーの情報アクセスは制限</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Permission Legend -->
          <div class="bg-blue-50 p-4 rounded-lg">
            <h5 class="font-medium text-blue-900 mb-2">権限について</h5>
            <div class="text-sm text-blue-700 space-y-1">
              <p><strong>管理者グループ (administrator):</strong> すべての機能にアクセス可能</p>
              <p><strong>その他のグループ:</strong> 基本的なユーザー機能のみ利用可能</p>
              <p><strong>権限制御:</strong> Cognitoグループメンバーシップに基づいて自動適用</p>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-6 py-4 border-t">
        <v-spacer />
        <v-btn variant="outlined" @click="closeDialog">
          閉じる
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { CognitoGroup } from '~/types'

interface Props {
  modelValue: boolean
  group?: CognitoGroup | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Permission definitions based on the system
const userPermissions = [
  { key: 'user:create', label: 'ユーザー作成', icon: 'mdi:account-plus' },
  { key: 'user:read', label: 'ユーザー参照', icon: 'mdi:account-eye' },
  { key: 'user:update', label: 'ユーザー更新', icon: 'mdi:account-edit' },
  { key: 'user:delete', label: 'ユーザー削除', icon: 'mdi:account-remove' }
]

const adminPermissions = [
  { key: 'admin:access', label: '管理者アクセス', icon: 'mdi:shield-check' },
  { key: 'group:create', label: 'グループ作成', icon: 'mdi:account-group-outline' },
  { key: 'group:read', label: 'グループ参照', icon: 'mdi:account-group' },
  { key: 'group:update', label: 'グループ更新', icon: 'mdi:account-edit-outline' },
  { key: 'group:delete', label: 'グループ削除', icon: 'mdi:account-remove-outline' },
  { key: 'batch:execute', label: '一括調整実行', icon: 'mdi:cash-multiple' },
  { key: 'batch:read', label: '一括調整閲覧', icon: 'mdi:history' }
]

const transactionPermissions = [
  { key: 'transaction:create', label: '取引作成', icon: 'mdi:plus-circle' },
  { key: 'market_rate:create', label: '市場価格設定', icon: 'mdi:chart-line' }
]

const basicPermissions = [
  { key: 'profile:read', label: 'プロフィール参照', icon: 'mdi:account' },
  { key: 'profile:update', label: 'プロフィール更新', icon: 'mdi:account-edit' },
  { key: 'transaction:read', label: '取引履歴参照', icon: 'mdi:format-list-bulleted' },
  { key: 'dashboard:access', label: 'ダッシュボード', icon: 'mdi:view-dashboard' }
]

// Methods
const closeDialog = () => {
  emit('update:modelValue', false)
}

const formatDate = (date?: Date) => {
  if (!date) return '不明'
  return new Date(date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
</script>