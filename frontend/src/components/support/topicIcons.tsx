import type { ComponentType } from 'react'
import { BoxIcon, CardIcon, ChatIcon, ClipboardIcon, LeafIcon, RefreshIcon, TagIcon, TruckIcon, UserIcon } from '../icons.tsx'
import type { TopicId } from '../../lib/support.ts'

export const topicIcons: Record<TopicId, ComponentType<{ className?: string }>> = {
  ORDER_STATUS: TruckIcon,
  DELIVERY: BoxIcon,
  PAYMENT: CardIcon,
  REFUND_RETURN: RefreshIcon,
  PRODUCT_QUALITY: LeafIcon,
  WRONG_OR_MISSING: ClipboardIcon,
  ACCOUNT: UserIcon,
  COUPON_OFFER: TagIcon,
  OTHER: ChatIcon,
}
