// Suite-ready auth module — extractable for baryapps
// No as_built-specific logic lives in this module.
//
// Client components: import from "@/lib/auth/context" or "@/lib/auth/use-github"
// Server/API routes:  import from "@/lib/auth/server"
// Edge middleware:     import from "@/lib/auth/middleware"
// Types (universal):  import from "@/lib/auth" (this file)

export { mapFirebaseUser } from "./types";
export type {
  AuthUser,
  AuthState,
  AuthActions,
  AuthContextValue,
} from "./types";
export type { VerifiedUser } from "./server";
