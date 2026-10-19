-- income_records is created before income_allocations so the foreign key can be enforced.
CREATE TABLE `budget_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`category` text NOT NULL,
	`amount` text NOT NULL,
	`month` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_budget_overrides_user_updated_at` ON `budget_overrides` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_overrides_user_category_month_live` ON `budget_overrides` (`user_id`,`category`,`month`) WHERE "budget_overrides"."deleted_at" is null and "budget_overrides"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_overrides_local_category_month_live` ON `budget_overrides` (`category`,`month`) WHERE "budget_overrides"."deleted_at" is null and "budget_overrides"."user_id" is null;--> statement-breakpoint
CREATE TABLE `budget_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`category` text NOT NULL,
	`amount` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_budget_plans_user_updated_at` ON `budget_plans` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_plans_user_category_live` ON `budget_plans` (`user_id`,`category`) WHERE "budget_plans"."deleted_at" is null and "budget_plans"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_plans_local_category_live` ON `budget_plans` (`category`) WHERE "budget_plans"."deleted_at" is null and "budget_plans"."user_id" is null;--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`category` text NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_user_updated_at` ON `expenses` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`institution_name` text,
	`custom_name` text,
	`amount` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_financial_accounts_user_updated_at` ON `financial_accounts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`target_amount` text NOT NULL,
	`saved_amount` text DEFAULT '0.00' NOT NULL,
	`pinned_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_goals_user_updated_at` ON `goals` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `income_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`total_amount` text NOT NULL,
	`disposable_amount` text NOT NULL,
	`date` text NOT NULL,
	`income_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_income_records_user_updated_at` ON `income_records` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `income_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`income_record_id` text,
	`goal_id` text NOT NULL,
	`amount` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dirty` integer DEFAULT true NOT NULL,
	`base_updated_at` text,
	FOREIGN KEY (`income_record_id`) REFERENCES `income_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_income_allocations_user_updated_at` ON `income_allocations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_income_allocations_goal_id` ON `income_allocations` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_income_allocations_income_record_id` ON `income_allocations` (`income_record_id`);--> statement-breakpoint
CREATE TABLE `local_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`user_id` text NOT NULL,
	`table_name` text NOT NULL,
	`cursor_updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `table_name`)
);
