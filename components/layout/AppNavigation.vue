<template>
  <v-navigation-drawer
    v-model="drawerModel"
    :rail="rail && !isMobile"
    :permanent="!isMobile"
    :temporary="isMobile"
    :floating="false"
    class="bg-white border-r border-gray-200"
    width="256"
    rail-width="64"
  >
    <!-- Header -->
    <div class="p-4 border-b border-gray-200">
      <div class="flex items-center space-x-3">
        <CommonAppLogo size="lg" :centered="false" />
        <div v-show="!rail || isMobile" class="min-w-0">
          <h2 class="text-sm font-semibold text-gray-900 truncate">M・S CFD App</h2>
          <p class="text-xs text-gray-500 truncate">{{ user?.name }}</p>
        </div>
      </div>
    </div>

    <!-- Navigation Items -->
    <v-list nav density="compact" class="pa-2">
      <!-- User Navigation -->
      <v-list-item
        v-for="item in userNavItems"
        :key="item.title"
        :to="item.to"
        :value="item.value"
        color="primary"
        rounded="lg"
        class="mb-1"
      >
        <template #prepend>
          <Icon :name="item.icon" class="text-xl" />
        </template>
        <v-list-item-title class="text-sm font-medium">
          {{ item.title }}
        </v-list-item-title>
      </v-list-item>

      <!-- Admin Navigation -->
      <template v-if="isAdmin">
        <v-divider class="my-4" />
        <v-list-subheader class="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">
          管理者機能
        </v-list-subheader>
        
        <v-list-item
          v-for="item in adminNavItems"
          :key="item.title"
          :to="item.to"
          :value="item.value"
          color="primary"
          rounded="lg"
          class="mb-1"
        >
          <template #prepend>
            <Icon :name="item.icon" class="text-xl" />
          </template>
          <v-list-item-title class="text-sm font-medium">
            {{ item.title }}
          </v-list-item-title>
        </v-list-item>
      </template>
    </v-list>

    <!-- Footer Actions -->
    <template #append>
      <div class="pa-2 border-t border-gray-200">
        <!-- Toggle Rail Button -->
        <v-btn
          v-if="!isMobile"
          variant="text"
          size="small"
          icon
          class="mb-2 w-full"
          @click="rail = !rail"
        >
          <Icon :name="rail ? 'mdi:menu' : 'mdi:menu-open'" />
        </v-btn>

        <!-- User Menu -->
        <v-menu location="top">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="text"
              block
              class="justify-start px-3"
            >
              <template #prepend>
                <v-avatar size="24" color="primary">
                  <span class="text-xs font-medium">{{ userInitials }}</span>
                </v-avatar>
              </template>
              <span v-show="!rail || isMobile" class="text-sm truncate ml-3">
                {{ user?.name }}
              </span>
            </v-btn>
          </template>

          <v-list density="compact" min-width="200">
            <v-list-item to="/profile" prepend-icon="mdi-account">
              <v-list-item-title>プロフィール</v-list-item-title>
            </v-list-item>
            <v-list-item to="/change-password" prepend-icon="mdi-lock">
              <v-list-item-title>パスワード変更</v-list-item-title>
            </v-list-item>
            <v-divider />
            <v-list-item prepend-icon="mdi-logout" @click="handleLogout">
              <v-list-item-title>ログアウト</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup>
// Props
const props = defineProps({
  isMobile: {
    type: Boolean,
    default: false
  },
  drawer: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits(['update:drawer'])

const logger = useLogger({ prefix: '[AppNavigation]' })
const { user, logout, isAdmin } = useAuth()
const { showSuccess, showError } = useNotification()

const rail = ref(false)

// Computed for v-model
const drawerModel = computed({
  get: () => props.drawer,
  set: (value) => emit('update:drawer', value)
})

const userNavItems = [
  {
    title: 'ダッシュボード',
    icon: 'mdi:view-dashboard',
    to: '/dashboard',
    value: 'dashboard'
  },
  {
    title: '入出金リクエスト',
    icon: 'mdi:cash-plus',
    to: '/transaction-requests',
    value: 'transaction-requests'
  },
  {
    title: '取引結果',
    icon: 'mdi:swap-horizontal',
    to: '/transactions',
    value: 'transactions'
  },
  {
    title: 'プロフィール',
    icon: 'mdi:account',
    to: '/profile',
    value: 'profile'
  }
]

const adminNavItems = [
  {
    title: '管理者ダッシュボード',
    icon: 'mdi:view-dashboard-variant',
    to: '/admin',
    value: 'admin-dashboard'
  },
  {
    title: 'ユーザー管理',
    icon: 'mdi:account-group',
    to: '/admin/users',
    value: 'admin-users'
  },
  {
    title: 'グループ管理',
    icon: 'mdi:shield-account',
    to: '/admin/groups',
    value: 'admin-groups'
  },
  {
    title: 'セグメント管理',
    icon: 'mdi:tag-multiple',
    to: '/admin/segments',
    value: 'admin-segments'
  },
  {
    title: '招待コード管理',
    icon: 'mdi:account-plus',
    to: '/admin/invites',
    value: 'admin-invites'
  },
  {
    title: '入出金管理',
    icon: 'mdi:bank-transfer',
    to: '/admin/transactions',
    value: 'admin-transactions'
  },
  {
    title: '入出金リクエスト承認',
    icon: 'mdi:cash-register',
    to: '/admin/transaction-requests',
    value: 'admin-transaction-requests'
  },
  {
    title: 'プロフィール承認',
    icon: 'mdi:check-circle',
    to: '/admin/approvals',
    value: 'admin-approvals'
  },
  {
    title: '一括資産調整',
    icon: 'mdi:cash-multiple',
    to: '/admin/batch-operations',
    value: 'admin-batch-operations'
  },
  {
    title: '相場価格設定',
    icon: 'mdi:chart-line',
    to: '/admin/rates',
    value: 'admin-rates'
  },
]

const userInitials = computed(() => {
  if (!user.value?.name) return 'U'
  return user.value.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const handleLogout = async () => {
  try {
    await logout()
    showSuccess('ログアウトしました')
  } catch (error) {
    logger.error('ログアウトエラー:', error)
    showError('ログアウト処理中にエラーが発生しました')
  }
}

// Handle mobile responsiveness
watch(() => props.isMobile, (isMobile) => {
  if (isMobile) {
    rail.value = false
  }
})
</script>