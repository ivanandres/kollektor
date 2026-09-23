CREATE TABLE "market_listings" (
	"release_id" uuid NOT NULL,
	"source" text NOT NULL,
	"lowest_price" numeric(12, 2),
	"currency" char(3),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_listings_release_id_source_pk" PRIMARY KEY("release_id","source")
);
--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;