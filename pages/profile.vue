<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">プロフィール</h1>
      <p class="text-gray-600">あなたの基本情報と免許証画像を管理できます</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Profile Form -->
      <div class="lg:col-span-2">
        <v-card class="card-shadow">
          <v-card-title class="px-6 py-4 border-b">
            <h3 class="text-lg font-semibold text-gray-900">基本情報</h3>
          </v-card-title>
          <v-card-text class="p-6">
            <v-form ref="formRef" @submit.prevent="updateProfile">
              <div class="space-y-4">
                <v-text-field
                  v-model="form.name"
                  label="氏名 *"
                  variant="outlined"
                  :rules="nameRules"
                  required
                />

                <v-text-field
                  :model-value="profile?.email || ''"
                  label="メールアドレス"
                  variant="outlined"
                  readonly
                  hint="メールアドレスは変更できません"
                  persistent-hint
                />

                <v-textarea
                  v-model="form.address"
                  label="住所 *"
                  variant="outlined"
                  :rules="addressRules"
                  rows="3"
                  required
                />

                <v-text-field
                  v-model="form.phone_number"
                  label="電話番号 *"
                  variant="outlined"
                  :rules="phoneRules"
                  required
                />

                <div class="flex items-center justify-between pt-4">
                  <div>
                    <p class="text-sm text-gray-600">最終更新: {{ formatDate(profile?.updated_at) }}</p>
                  </div>
                  <div class="space-x-2">
                    <v-btn
                      variant="outlined"
                      :disabled="loading"
                      @click="resetForm"
                    >
                      リセット
                    </v-btn>
                    <v-btn
                      color="primary"
                      :loading="loading"
                      @click="updateProfile"
                    >
                      更新
                    </v-btn>
                  </div>
                </div>
              </div>
            </v-form>
          </v-card-text>
        </v-card>
      </div>

      <!-- Profile Image & Info -->
      <div class="space-y-6">
        <!-- Profile Image Card -->
        <v-card class="card-shadow">
          <v-card-title class="px-6 py-4 border-b">
            <h3 class="text-lg font-semibold text-gray-900">免許証画像</h3>
          </v-card-title>
          <v-card-text class="p-6">
            <div class="text-center space-y-4">
              <!-- Current Image -->
              <div v-if="profile?.profile_image_url" class="space-y-4">
                <img 
                  :src="profile.profile_image_url" 
                  :alt="`${profile.name}の免許証`"
                  class="w-full h-auto max-h-48 object-contain rounded-lg border shadow-sm"
                  @error="handleImageError"
                >
                <div class="flex items-center justify-center space-x-2">
                  <v-btn
                    variant="outlined"
                    size="small"
                    prepend-icon="mdi-fullscreen"
                    @click="viewFullImage"
                  >
                    拡大表示
                  </v-btn>
                </div>
              </div>

              <!-- No Image Placeholder -->
              <div v-else class="py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <Icon name="mdi:image-plus" class="text-4xl text-gray-400 mb-2" />
                <p class="text-gray-500 text-sm">免許証画像をアップロードしてください</p>
              </div>

              <!-- Upload Button -->
              <div>
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  class="hidden"
                  @change="handleFileSelect"
                >
                <v-btn
                  color="primary"
                  variant="outlined"
                  prepend-icon="mdi-upload"
                  :loading="uploadLoading"
                  block
                  @click="triggerFileUpload"
                >
                  画像をアップロード
                </v-btn>
                <p class="text-xs text-gray-500 mt-2">
                  JPEG, PNG形式、最大5MBまで
                </p>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Account Info Card -->
        <v-card class="card-shadow">
          <v-card-title class="px-6 py-4 border-b">
            <h3 class="text-lg font-semibold text-gray-900">アカウント情報</h3>
          </v-card-title>
          <v-card-text class="p-6">
            <div class="space-y-4">
              <!-- Approval Status -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">承認ステータス</span>
                <v-chip
                  :color="profile?.profile_approved ? 'success' : 'warning'"
                  size="small"
                  variant="flat"
                >
                  <Icon 
                    :name="profile?.profile_approved ? 'mdi:check' : 'mdi:clock-outline'" 
                    class="mr-1" 
                  />
                  {{ profile?.profile_approved ? '承認済み' : '承認待ち' }}
                </v-chip>
              </div>

              <!-- Account Status -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">アカウント状態</span>
                <v-chip
                  :color="getStatusColor(profile?.status)"
                  size="small"
                  variant="flat"
                >
                  {{ getStatusText(profile?.status) }}
                </v-chip>
              </div>

              <!-- Created Date -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">作成日</span>
                <span class="text-sm">{{ formatDate(profile?.created_at) }}</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </div>

    <!-- Sub-Accounts -->
    <div class="mt-6">
      <v-card class="card-shadow">
        <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">サブアカウント</h3>
          <v-btn color="primary" size="small" prepend-icon="mdi-account-plus" @click="showSubAccountDialog = true">
            新規サブアカウント作成
          </v-btn>
        </v-card-title>
        <v-card-text class="p-6">
          <div v-if="loadingSubAccounts" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" />
          </div>
          <div v-else-if="subAccounts.length === 0" class="text-center py-6 text-gray-500">
            サブアカウントはまだありません
          </div>
          <div v-else class="space-y-3">
            <div v-for="sub in subAccounts" :key="sub.user_id"
              class="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p class="font-medium text-gray-900">{{ sub.name }}</p>
                <p class="text-sm text-gray-500">{{ sub.email }}</p>
              </div>
              <div class="flex items-center gap-2">
                <v-chip :color="sub.profile_approved ? 'success' : 'warning'" size="small" variant="flat">
                  {{ sub.profile_approved ? '承認済み' : '承認待ち' }}
                </v-chip>
                <v-chip :color="getStatusColor(sub.status)" size="small" variant="flat">
                  {{ getStatusText(sub.status) }}
                </v-chip>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Image Viewer Dialog -->
    <UserImageViewerDialog
      v-model="showImageDialog"
      :image-url="profile?.profile_image_url || ''"
    />

    <!-- Sub-Account Create Dialog -->
    <UserSubAccountCreateDialog
      v-model="showSubAccountDialog"
      @created="loadSubAccounts"
    />
  </div>
</template>

<script setup lang="ts">
import type { User, UserUpdateForm } from '~/types'

const logger = useLogger({ prefix: '[PAGE-PROFILE]' })
const apiClient = useApiClient()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'プロフィール - M・S CFD App'
})

const { showSuccess, showError } = useNotification()

// State
const profile = ref<User | null>(null)
const loading = ref(false)
const uploadLoading = ref(false)
const showImageDialog = ref(false)
const showSubAccountDialog = ref(false)
const subAccounts = ref<User[]>([])
const loadingSubAccounts = ref(false)
const formRef = ref()
const fileInput = ref<HTMLInputElement>()

const form = reactive<UserUpdateForm>({
  name: '',
  address: '',
  phone_number: ''
})

// Validation rules
const nameRules = [
  (v: string) => !!v || '氏名は必須です',
  (v: string) => v.length >= 2 || '氏名は2文字以上で入力してください'
]

const addressRules = [
  (v: string) => !!v || '住所は必須です',
  (v: string) => v.length >= 10 || '住所は10文字以上で入力してください'
]

const phoneRules = [
  (v: string) => !!v || '電話番号は必須です',
  (v: string) => /^[\d-+()]+$/.test(v) || '有効な電話番号を入力してください'
]

// Methods
const loadProfile = async () => {
  loading.value = true
  try {
    const response = await apiClient.get<User>('/profile')
    const data = response.data!
    profile.value = data
    
    // Populate form
    form.name = data.name || ''
    form.address = data.address || ''
    form.phone_number = data.phone_number || ''
  } catch (error: unknown) {
    logger.error('プロフィールの読み込みに失敗しました:', error)
    showError('プロフィールの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const updateProfile = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true
  try {
    await apiClient.put('/profile', form)

    showSuccess('プロフィールを更新しました')
    await loadProfile()
  } catch (error: unknown) {
    logger.error('プロフィールの更新に失敗しました:', error)
    showError('プロフィールの更新に失敗しました')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  if (profile.value) {
    form.name = profile.value.name || ''
    form.address = profile.value.address || ''
    form.phone_number = profile.value.phone_number || ''
  }
  formRef.value?.resetValidation()
}

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return

  uploadImage(file)
}

const uploadImage = async (file: File) => {
  uploadLoading.value = true
  
  try {
    // Validate file size (max 3MB)
    const maxSize = 3 * 1024 * 1024 // 3MB
    if (file.size > maxSize) {
      showError('ファイルサイズが大きすぎます。3MB以下のファイルを選択してください')
      return
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      showError('ファイル形式が無効です。JPEG、PNG形式のファイルを選択してください')
      return
    }

    // Convert file to Base64
    const base64Data = await fileToBase64(file)

    // Send as JSON
    await apiClient.post('/upload/image', {
      filename: file.name,
      contentType: file.type,
      base64Data
    })

    showSuccess('画像をアップロードしました')
    await loadProfile()
  } catch (error: unknown) {
    logger.error('画像のアップロードに失敗しました:', error)
    
    if (error && typeof error === 'object' && 'data' in error) {
      const errorData = error.data as { statusMessage?: string }
      if (errorData?.statusMessage?.includes('Invalid file type')) {
        showError('ファイル形式が無効です。JPEG、PNG形式のファイルを選択してください')
      } else if (errorData?.statusMessage?.includes('File size too large')) {
        showError('ファイルサイズが大きすぎます。3MB以下のファイルを選択してください')
      } else {
        showError('画像のアップロードに失敗しました')
      }
    } else {
      showError('画像のアップロードに失敗しました')
    }
  } finally {
    uploadLoading.value = false
    // Reset file input
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const viewFullImage = () => {
  showImageDialog.value = true
}

const handleImageError = () => {
  showError('画像の読み込みに失敗しました')
}

// Utility functions
const getStatusColor = (status?: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'suspended': return 'warning'
    case 'deleted': return 'error'
    default: return 'grey'
  }
}

const getStatusText = (status?: string) => {
  switch (status) {
    case 'active': return 'アクティブ'
    case 'suspended': return '停止中'
    case 'deleted': return '削除済み'
    default: return '不明'
  }
}

const formatDate = (dateString?: string) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

const loadSubAccounts = async () => {
  loadingSubAccounts.value = true
  try {
    const response = await apiClient.get<{ items: User[] }>('/account/sub-accounts')
    subAccounts.value = response.data?.items || []
  } catch (error: unknown) {
    logger.error('サブアカウント一覧の読み込みに失敗しました:', error)
  } finally {
    loadingSubAccounts.value = false
  }
}

// Load profile on mount
onMounted(() => {
  loadProfile()
  loadSubAccounts()
})
</script>