/*
 * Marketplace tables (metadata/index only). What is sold or gifted is ACCESS — a scoped,
 * revocable delegate key on the seller's `memwal::account` (mirrored in connected_apps) —
 * never the memory bytes themselves (Source-of-Truth: Walrus + Sui). A gift's delegate-key
 * secret is held encrypted at rest ONLY until the recipient's one-time claim, then wiped
 * (Constitution Principle IX); purchase secrets are shown once and never stored.
 */
import { newId } from "@soul/id";
import { ACQUISITION_KINDS, LISTING_STATUSES, type Namespace } from "@soul/shared";
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./accounts";
import { connectedApps } from "./permissions";

/** Raw bytes column — holds the encrypted-at-rest gift secret until claimed (then NULL). */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const listingStatusEnum = pgEnum("listing_status", LISTING_STATUSES);
export const acquisitionKindEnum = pgEnum("acquisition_kind", ACQUISITION_KINDS);

export const marketListings = pgTable("market_listings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("listing")),
  sellerUserId: text("seller_user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  /** Relayer-enforced namespace scope of the licensed delegate keys (NOT an on-chain guarantee). */
  scope: jsonb("scope").$type<Namespace[]>().notNull(),
  /** Price in MIST as a decimal string (bigint-safe). */
  priceMist: text("price_mist").notNull(),
  status: listingStatusEnum("status").notNull().default("active"),
  salesCount: integer("sales_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketAcquisitions = pgTable("market_acquisitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("acq")),
  kind: acquisitionKindEnum("kind").notNull(),
  listingId: text("listing_id").references(() => marketListings.id),
  title: text("title").notNull(),
  buyerUserId: text("buyer_user_id")
    .notNull()
    .references(() => users.id),
  sellerUserId: text("seller_user_id")
    .notNull()
    .references(() => users.id),
  /** The delegate key on the SELLER's account backing this acquisition (revocable there). */
  appId: text("app_id")
    .notNull()
    .references(() => connectedApps.id),
  scope: jsonb("scope").$type<Namespace[]>().notNull(),
  /** "0" for gifts. */
  priceMist: text("price_mist").notNull(),
  /** Payment transaction digest (simulated by the mock chain in dev mode). */
  txDigest: text("tx_digest"),
  /** True once the one-time credential reveal has been used (purchases start claimed). */
  claimed: boolean("claimed").notNull().default(false),
  /** Encrypted-at-rest gift secret; wiped (NULL) on claim. Never logged or returned. */
  delegateSecretEnc: bytea("delegate_secret_enc"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
