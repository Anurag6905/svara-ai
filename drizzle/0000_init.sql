CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`timestamp` integer NOT NULL,
	`redacted_metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_time_idx` ON `audit_events` (`organisation_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`mode` text DEFAULT 'SIMULATION' NOT NULL,
	`scenario` text,
	`status` text NOT NULL,
	`outcome` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`language` text,
	`provider` text DEFAULT 'mock' NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversations_org_idx` ON `conversations` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `conversations_lead_idx` ON `conversations` (`lead_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`need_profile_id` text NOT NULL,
	`field_name` text NOT NULL,
	`transcript_segment_id` text,
	`evidence_text` text,
	`source_type` text NOT NULL,
	`confidence` real,
	`human_reviewed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`need_profile_id`) REFERENCES `need_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transcript_segment_id`) REFERENCES `transcript_segments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_profile_idx` ON `evidence` (`need_profile_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`external_lead_id` text NOT NULL,
	`first_name` text,
	`phone_number` text NOT NULL,
	`category` text,
	`source` text NOT NULL,
	`enquiry_date` text,
	`preferred_language` text,
	`permission_status` text DEFAULT 'MISSING' NOT NULL,
	`permission_timestamp` text,
	`permission_source` text,
	`permission_reference` text,
	`do_not_call_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`status` text DEFAULT 'IMPORTED' NOT NULL,
	`is_synthetic` integer DEFAULT true NOT NULL,
	`import_batch_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_org_idx` ON `leads` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `leads_org_status_idx` ON `leads` (`organisation_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_org_external_unique` ON `leads` (`organisation_id`,`external_lead_id`);--> statement-breakpoint
CREATE INDEX `leads_org_phone_idx` ON `leads` (`organisation_id`,`phone_number`);--> statement-breakpoint
CREATE TABLE `need_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`purpose` text,
	`amount_range` text,
	`timeline` text,
	`preferences_json` text DEFAULT '{}' NOT NULL,
	`interest_status` text,
	`callback_time` text,
	`missing_fields_json` text DEFAULT '[]' NOT NULL,
	`extraction_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `need_profiles_conversation_idx` ON `need_profiles` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`institution_type` text NOT NULL,
	`is_demo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`product_id` text,
	`match_status` text NOT NULL,
	`explanation` text NOT NULL,
	`missing_information_json` text DEFAULT '[]' NOT NULL,
	`human_review_status` text DEFAULT 'PENDING' NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_conversation_idx` ON `product_matches` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`approved_description` text NOT NULL,
	`attributes_json` text DEFAULT '{}' NOT NULL,
	`eligibility_wording` text,
	`disclaimers` text,
	`prohibited_statements` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_org_idx` ON `products` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`corrected_summary` text,
	`outcome` text NOT NULL,
	`next_action` text,
	`follow_up_at` text,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reviews_conversation_idx` ON `reviews` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`speaker` text NOT NULL,
	`text` text NOT NULL,
	`timestamp_ms` integer NOT NULL,
	`confidence` real,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `segments_conversation_idx` ON `transcript_segments` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`title` text,
	`role` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_org_idx` ON `users` (`organisation_id`);