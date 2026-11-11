ALTER TABLE "practice_sessions" ADD COLUMN "completed_seq" bigint;--> statement-breakpoint
-- 已结束的旧会话没有结束序号，先补一个再加约束（它们结束后不会再有作答和跳过，学习事件按新序号计入总结）
UPDATE "practice_sessions" SET "completed_seq" = nextval('practice_record_seq') WHERE "status" = 'completed';--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_completed_seq_ck" CHECK (("practice_sessions"."status" = 'completed') = ("practice_sessions"."completed_seq" is not null));
