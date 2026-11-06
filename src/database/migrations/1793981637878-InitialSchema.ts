import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793981637878 implements MigrationInterface {
    name = 'InitialSchema1793981637878'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid, "actor_id" uuid, "action" character varying(100) NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_faca7dc2658a8e6d738d4f66dc" ON "audit_logs"  ("application_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "business_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7b5826670252d05980aa622e934" UNIQUE ("code"), CONSTRAINT "PK_3c34c2b0b96fd7d13d7b4750b27" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(50) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "role_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "risk_assessments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "idempotency_key" character varying(150) NOT NULL, "risk_score" integer NOT NULL, "result" character varying(50) NOT NULL, "provider_reference" character varying(100), "response_summary" jsonb NOT NULL DEFAULT '{}', "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_902461c92154f52028330329dc8" UNIQUE ("idempotency_key"), CONSTRAINT "CHK_5ef108bdeb9518d30d7e73c8d9" CHECK ("risk_score" >= 0 AND "risk_score" <= 100), CONSTRAINT "PK_2717ff3f294d30390a712653d63" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."application_reviews_decision_enum" AS ENUM('APPROVE', 'REJECT', 'REQUEST_INFO')`);
        await queryRunner.query(`CREATE TABLE "application_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "reviewer_id" uuid NOT NULL, "decision" "public"."application_reviews_decision_enum" NOT NULL, "remarks" text, "decided_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_23f8004d07c6b4fd00875407a35" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."merchant_application_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO')`);
        await queryRunner.query(`CREATE TYPE "public"."merchant_risk_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "merchant_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "business_name" character varying(255) NOT NULL, "legal_name" character varying(255) NOT NULL, "business_type_id" uuid NOT NULL, "owner_email" character varying(255) NOT NULL, "owner_phone" character varying(50) NOT NULL, "requested_volume" numeric(15,2) NOT NULL, "application_status" "public"."merchant_application_status_enum" NOT NULL DEFAULT 'DRAFT', "risk_status" "public"."merchant_risk_status_enum" NOT NULL DEFAULT 'PENDING', "created_by_id" uuid NOT NULL, "assigned_reviewer_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_09b9df0877db73b8a232c8c7ed4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_48608dafce64e780604e88fead" ON "merchant_applications"  ("assigned_reviewer_id", "application_status") `);
        await queryRunner.query(`CREATE INDEX "IDX_820ded4c4c9f905c036c10866a" ON "merchant_applications"  ("created_by_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "risk_assessments" ADD CONSTRAINT "FK_71bdfb15c3833a8f888591dee12" FOREIGN KEY ("application_id") REFERENCES "merchant_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "application_reviews" ADD CONSTRAINT "FK_37429cb43f4837e1c8a0032ba51" FOREIGN KEY ("application_id") REFERENCES "merchant_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "application_reviews" ADD CONSTRAINT "FK_e0096d017ec933b8e3a7bf2e281" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_37f53b638b4496b02bf7cb7ff15" FOREIGN KEY ("business_type_id") REFERENCES "business_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_2da4df0ec53929a13cb78d8496a" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_7da78a3bb9e76995dba067b83ed" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merchant_applications" DROP CONSTRAINT "FK_7da78a3bb9e76995dba067b83ed"`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" DROP CONSTRAINT "FK_2da4df0ec53929a13cb78d8496a"`);
        await queryRunner.query(`ALTER TABLE "merchant_applications" DROP CONSTRAINT "FK_37f53b638b4496b02bf7cb7ff15"`);
        await queryRunner.query(`ALTER TABLE "application_reviews" DROP CONSTRAINT "FK_e0096d017ec933b8e3a7bf2e281"`);
        await queryRunner.query(`ALTER TABLE "application_reviews" DROP CONSTRAINT "FK_37429cb43f4837e1c8a0032ba51"`);
        await queryRunner.query(`ALTER TABLE "risk_assessments" DROP CONSTRAINT "FK_71bdfb15c3833a8f888591dee12"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_820ded4c4c9f905c036c10866a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_48608dafce64e780604e88fead"`);
        await queryRunner.query(`DROP TABLE "merchant_applications"`);
        await queryRunner.query(`DROP TYPE "public"."merchant_risk_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."merchant_application_status_enum"`);
        await queryRunner.query(`DROP TABLE "application_reviews"`);
        await queryRunner.query(`DROP TYPE "public"."application_reviews_decision_enum"`);
        await queryRunner.query(`DROP TABLE "risk_assessments"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TABLE "business_types"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faca7dc2658a8e6d738d4f66dc"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
