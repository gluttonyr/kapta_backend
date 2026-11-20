-- Kapta initial schema (generated from the TypeORM entities). Production has synchronize off:
-- run ONCE on the empty kapta_db before the first start of the backend.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TABLE public.activation_codes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code_hash character varying NOT NULL,
    code_hint character varying(4) NOT NULL,
    client_id uuid NOT NULL,
    duration_days integer NOT NULL,
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    used_by_user_id uuid,
    device_id character varying,
    revoked_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    client_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.clients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    backend_url character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.licenses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    device_id character varying NOT NULL,
    activated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_check_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.super_admins (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT "PK_466d3b6370f0695b22d664e9dff" PRIMARY KEY (id);

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT "PK_a72dbbeaa882b981dde20ccefc9" PRIMARY KEY (id);

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY (id);

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY (id);

ALTER TABLE ONLY public.client_users
    ADD CONSTRAINT "PK_fe74bfd4d01077395ee4204b553" PRIMARY KEY (id);

ALTER TABLE ONLY public.client_users
    ADD CONSTRAINT "UQ_1b08a71cf48cbbd139d4742d61a" UNIQUE (email);

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT "UQ_9719b4228e14e28a8253cb108f2" UNIQUE (email);

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT "UQ_e89a4feda833804437f812cb563" UNIQUE (code_hash);

CREATE UNIQUE INDEX "IDX_65f3acd6a11a68b286f850c449" ON public.licenses USING btree (client_id, device_id);

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT "FK_24121d1ef249fc30026bd4eeca1" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT "FK_73c4f3c2e94e7e3558a8a380de3" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_users
    ADD CONSTRAINT "FK_934bd66f558a7304bf4d2c2597b" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

COMMIT;
