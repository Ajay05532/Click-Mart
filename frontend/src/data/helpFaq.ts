import type { Faq } from '../lib/support.ts'

/**
 * Shown on the Help centre until the team publishes its own articles in the admin app
 * (Support, Help articles). As soon as one article is published, only those are shown.
 * Keep the wording general: the admin app is the place for exact timings and amounts.
 */
export const defaultFaqs: Faq[] = [
  {
    id: 'default-track',
    category: 'ORDERS',
    question: 'How do I track my order?',
    answer: 'Open My orders and choose View order. You will see every step from packed to delivered, and the courier and tracking number once it ships. We also email you at each step.',
  },
  {
    id: 'default-cancel',
    category: 'ORDERS',
    question: 'Can I cancel an order?',
    answer: 'Yes, until we pack it. Open the order and use Cancel this order. If you paid online, the amount goes back to your original payment method. Once an order is packed for delivery it cannot be cancelled. After delivery you can ask for a return.',
  },
  {
    id: 'default-change',
    category: 'ORDERS',
    question: 'Can I change the address or items after ordering?',
    answer: 'Items cannot be changed once an order is placed. If the address is wrong, raise a request straight away with the order number and the correct address. We can only update it before the order is packed.',
  },
  {
    id: 'default-time',
    category: 'DELIVERY',
    question: 'How long does delivery take?',
    answer: 'Most orders arrive within about four working days. The expected date is shown on your order page, and a more exact estimate appears once the order ships.',
  },
  {
    id: 'default-fee',
    category: 'DELIVERY',
    question: 'What does delivery cost?',
    answer: 'Orders above the free-delivery amount shown in your cart ship free. Below that, a small flat delivery fee applies. You see the exact amount before you pay.',
  },
  {
    id: 'default-missed',
    category: 'DELIVERY',
    question: 'My order is late or the courier could not reach me.',
    answer: 'Check the tracking on your order page first. If it has not moved for two days, or a delivery attempt failed, raise a request under Delivery problem and we will chase the courier.',
  },
  {
    id: 'default-methods',
    category: 'PAYMENTS',
    question: 'Which payment methods can I use?',
    answer: 'UPI, debit and credit cards, net banking and, for smaller orders, cash on delivery. Available methods are shown at checkout.',
  },
  {
    id: 'default-failed',
    category: 'PAYMENTS',
    question: 'My payment failed but money was deducted.',
    answer: 'Banks usually reverse a failed payment automatically within 5 to 7 working days. If the amount is not back by then, raise a request under Payment or refund with the date and payment reference and we will check it with the gateway.',
  },
  {
    id: 'default-card',
    category: 'PAYMENTS',
    question: 'Do you store my card details?',
    answer: 'No. We never see or store your full card number or CVV. Cards are typed into the payment window of our payment partner, and we only keep the last four digits to show in your account.',
  },
  {
    id: 'default-refund',
    category: 'RETURNS',
    question: 'When will I get my refund?',
    answer: 'Refunds for cancelled or returned prepaid orders go back to the original payment method. After we process it, banks usually take 5 to 7 working days to show it. You can follow the status on your order page.',
  },
  {
    id: 'default-return',
    category: 'RETURNS',
    question: 'What if my item is damaged, wrong or not fresh?',
    answer: 'We are sorry. Raise a request from the order page within 48 hours of delivery and attach a photo of the pouch and its label. We will replace it or refund you once we have checked.',
  },
  {
    id: 'default-opened',
    category: 'RETURNS',
    question: 'Can I return a pouch I have opened?',
    answer: 'For food safety we cannot take back opened pouches unless there is a quality problem. If something is wrong with what you received, tell us and we will make it right.',
  },
  {
    id: 'default-allergy',
    category: 'PRODUCTS',
    question: 'Where can I see ingredients and allergy information?',
    answer: 'Every product page lists its ingredients, origin and shelf life. If you have an allergy, please write to us before ordering so we can confirm details for the specific product.',
  },
  {
    id: 'default-fresh',
    category: 'PRODUCTS',
    question: 'How fresh are the dry fruits?',
    answer: 'Orders are packed in small batches and sealed, and the pouch label shows the packing and best-before details. Store them in a cool, dry place and reseal after opening.',
  },
  {
    id: 'default-password',
    category: 'ACCOUNT',
    question: 'I forgot my password.',
    answer: 'Go to the login page and choose Forgot password. We email you a link that works for 30 minutes. For safety, it signs you out of every device.',
  },
  {
    id: 'default-profile',
    category: 'ACCOUNT',
    question: 'How do I change my phone number, email or address?',
    answer: 'Open Account settings. Your name, phone and saved addresses can be edited there. To change the email on your account, raise a request and we will help.',
  },
]
