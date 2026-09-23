ALTER TABLE "collection_items" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "client_request_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_items_client_request_uq" ON "collection_items" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_client_request_uq" ON "wishlist_items" USING btree ("user_id","client_request_id");