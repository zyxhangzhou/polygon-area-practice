CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" integer NOT NULL,
	"client_attempt_id" uuid NOT NULL,
	"raw_input" text NOT NULL,
	"normalized_value" numeric(10, 2) NOT NULL,
	"is_correct" boolean NOT NULL,
	"attempt_no" integer NOT NULL,
	"matched_mistake" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_client_id_uq" UNIQUE("session_id","client_attempt_id"),
	CONSTRAINT "attempts_attempt_no_uq" UNIQUE("session_id","question_id","attempt_no"),
	CONSTRAINT "attempts_attempt_no_ck" CHECK ("attempts"."attempt_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" integer NOT NULL,
	"type" text NOT NULL,
	"client_event_id" uuid NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_events_client_id_uq" UNIQUE("session_id","client_event_id"),
	CONSTRAINT "learning_events_type_ck" CHECK ("learning_events"."type" in ('explanation_text_opened', 'video_started', 'video_completed'))
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"ended_early" boolean,
	CONSTRAINT "practice_sessions_status_ck" CHECK ("practice_sessions"."status" in ('in_progress', 'completed')),
	CONSTRAINT "practice_sessions_completed_at_ck" CHECK (("practice_sessions"."status" = 'completed') = ("practice_sessions"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "question_skips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" integer NOT NULL,
	"client_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_skips_client_id_uq" UNIQUE("session_id","client_request_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" integer PRIMARY KEY NOT NULL,
	"stage_id" integer NOT NULL,
	"position_in_stage" integer NOT NULL,
	"shape_type" text NOT NULL,
	"prompt" text NOT NULL,
	"figure" jsonb NOT NULL,
	"answer" numeric(10, 2) NOT NULL,
	"unit" text NOT NULL,
	"explanation" jsonb NOT NULL,
	"video_url" text,
	"common_mistakes" jsonb NOT NULL,
	"knowledge_point" text NOT NULL,
	CONSTRAINT "questions_stage_position_uq" UNIQUE("stage_id","position_in_stage"),
	CONSTRAINT "questions_position_in_stage_ck" CHECK ("questions"."position_in_stage" between 1 and 3),
	CONSTRAINT "questions_answer_ck" CHECK ("questions"."answer" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"session_id" uuid NOT NULL,
	"question_id" integer NOT NULL,
	"position" integer NOT NULL,
	"stage_id" integer NOT NULL,
	CONSTRAINT "session_questions_session_id_question_id_pk" PRIMARY KEY("session_id","question_id"),
	CONSTRAINT "session_questions_position_uq" UNIQUE("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" integer PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"building_name" text NOT NULL,
	"intro" text NOT NULL,
	CONSTRAINT "stages_position_unique" UNIQUE("position")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_snapshot_fk" FOREIGN KEY ("session_id","question_id") REFERENCES "public"."session_questions"("session_id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_snapshot_fk" FOREIGN KEY ("session_id","question_id") REFERENCES "public"."session_questions"("session_id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skips" ADD CONSTRAINT "question_skips_snapshot_fk" FOREIGN KEY ("session_id","question_id") REFERENCES "public"."session_questions"("session_id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_sessions_one_in_progress_uq" ON "practice_sessions" USING btree ("learner_id") WHERE status = 'in_progress';