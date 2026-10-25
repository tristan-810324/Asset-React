export const landingNavigationItems = [
  { label: 'Home', section: 'home' },
  { label: 'Features', section: 'features' },
  { label: 'How it works', section: 'workflow' },
  { label: 'About', section: 'about' },
  { label: 'FAQ', section: 'faq' },
  { label: 'Contact', section: 'contact' },
] as const

export type LandingSectionId = (typeof landingNavigationItems)[number]['section']
