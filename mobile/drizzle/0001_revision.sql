ALTER TABLE `expenses` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `income_records` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `goals` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `income_allocations` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `budget_plans` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `budget_overrides` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD `revision` integer DEFAULT 0 NOT NULL;
