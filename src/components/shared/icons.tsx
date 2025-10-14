import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  File,
  FileText,
  Flame,
  HelpCircle,
  Home,
  Image,
  Laptop,
  LayoutPanelLeft,
  LineChart,
  Loader2,
  LogOut,
  LucideIcon,
  LucideProps,
  MessagesSquare,
  Moon,
  MoreVertical,
  Package,
  Plus,
  Search,
  Settings,
  SunMedium,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"

export type Icon = LucideIcon

export const Icons = {
  add: Plus,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  bookOpen: BookOpen,
  check: Check,
  close: X,
  copy: Copy,
  dashboard: LayoutPanelLeft,
  ellipsis: MoreVertical,
  google: ({ ...props }: LucideProps) => (
    <svg
      aria-hidden="true"
      focusable="false"
      data-prefix="fab"
      data-icon="google"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 488 512"
      {...props}
    >
      <path
        d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
        fill="currentColor"
      />
    </svg>
  ),
  help: HelpCircle,
  home: Home,
  laptop: Laptop,
  lineChart: LineChart,
  logo: Flame,
  logout: LogOut,
  media: Image,
  messages: MessagesSquare,
  moon: Moon,
  page: File,
  package: Package,
  post: FileText,
  search: Search,
  settings: Settings,
  spinner: Loader2,
  sun: SunMedium,
  trash: Trash2,
  user: User,
  userPlus: UserPlus,
  userMinus: UserMinus,
  warning: AlertTriangle,
}
