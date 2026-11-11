-- 位置唯一约束改为提交时检查：种子按 ID 逐行 upsert，交换两道题（或两个关卡）的顺序时，
-- 事务中途会暂时出现重复位置。立即检查会让事务失败；提交时检查仍保证最终唯一。
-- Drizzle schema 无法表达 DEFERRABLE，因此用自定义迁移（见 src/db/schema.ts 注释）。
ALTER TABLE "questions" DROP CONSTRAINT "questions_stage_position_uq";--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_stage_position_uq" UNIQUE ("stage_id", "position_in_stage") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stages_position_unique";--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_position_unique" UNIQUE ("position") DEFERRABLE INITIALLY DEFERRED;
