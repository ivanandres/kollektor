CREATE TABLE "collection_item_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_items" DROP CONSTRAINT "collection_items_release_id_releases_id_fk";
--> statement-breakpoint
ALTER TABLE "wishlist_items" DROP CONSTRAINT "wishlist_items_album_id_albums_id_fk";
--> statement-breakpoint
ALTER TABLE "collection_item_photos" ADD CONSTRAINT "collection_item_photos_collection_item_id_collection_items_id_fk" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_item_photos_item_idx" ON "collection_item_photos" USING btree ("collection_item_id");--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;