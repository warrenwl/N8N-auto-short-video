--
-- PostgreSQL database dump
--

\restrict CAMwkFCvKrGCfpdtY0oCoCQl4cydJcYzKscPOy5g7Z51W7Bqrzh1za08VBkIUwD

-- Dumped from database version 17.9 (Debian 17.9-1.pgdg13+1)
-- Dumped by pg_dump version 17.9 (Debian 17.9-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: n8n
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO n8n;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: video_topics; Type: TABLE; Schema: public; Owner: n8n
--

CREATE TABLE public.video_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic text NOT NULL,
    platform text DEFAULT 'youtube'::text NOT NULL,
    style text DEFAULT '口播科普'::text NOT NULL,
    duration_seconds integer DEFAULT 45 NOT NULL,
    language text DEFAULT 'zh-CN'::text NOT NULL,
    target_audience text DEFAULT '普通短视频用户'::text,
    status text DEFAULT 'IDEA'::text NOT NULL,
    title text,
    hook text,
    script text,
    cover_text text,
    hashtags jsonb DEFAULT '[]'::jsonb NOT NULL,
    shots_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    risk_check jsonb DEFAULT '{}'::jsonb NOT NULL,
    video_path text,
    cover_path text,
    publish_url text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subtitle_path text,
    clips_json jsonb,
    render_manifest jsonb,
    render_started_at timestamp with time zone,
    render_finished_at timestamp with time zone,
    voice_path text,
    audio_duration double precision,
    audio_engine text,
    audio_started_at timestamp without time zone,
    audio_finished_at timestamp without time zone,
    shot_images_json jsonb,
    media_engine text,
    media_manifest jsonb,
    comfyui_prompt_ids jsonb,
    media_started_at timestamp without time zone,
    media_finished_at timestamp without time zone,
    template_type text DEFAULT 'knowledge'::text NOT NULL,
    CONSTRAINT video_topics_duration_seconds_check CHECK ((duration_seconds > 0)),
    CONSTRAINT video_topics_status_check CHECK ((status = ANY (ARRAY['IDEA'::text, 'GENERATING_SCRIPT'::text, 'SCRIPT_READY'::text, 'RENDER_PREPARED'::text, 'GENERATING_AUDIO'::text, 'AUDIO_READY'::text, 'GENERATING_COVER'::text, 'COVER_READY'::text, 'RENDERING_VIDEO'::text, 'MEDIA_READY'::text, 'RENDERING'::text, 'RENDERED'::text, 'NEED_REVIEW'::text, 'APPROVED'::text, 'PUBLISHED'::text, 'FAILED'::text, 'RENDER_FAILED'::text]))),
    CONSTRAINT video_topics_template_type_check CHECK ((template_type = ANY (ARRAY['knowledge'::text, 'list'::text, 'contrast'::text, 'story'::text])))
);


ALTER TABLE public.video_topics OWNER TO n8n;

--
-- Name: video_topics video_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: n8n
--

ALTER TABLE ONLY public.video_topics
    ADD CONSTRAINT video_topics_pkey PRIMARY KEY (id);


--
-- Name: idx_video_topics_media_engine; Type: INDEX; Schema: public; Owner: n8n
--

CREATE INDEX idx_video_topics_media_engine ON public.video_topics USING btree (media_engine);


--
-- Name: idx_video_topics_status_created_at; Type: INDEX; Schema: public; Owner: n8n
--

CREATE INDEX idx_video_topics_status_created_at ON public.video_topics USING btree (status, created_at);


--
-- Name: video_topics trg_video_topics_updated_at; Type: TRIGGER; Schema: public; Owner: n8n
--

CREATE TRIGGER trg_video_topics_updated_at BEFORE UPDATE ON public.video_topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- PostgreSQL database dump complete
--

\unrestrict CAMwkFCvKrGCfpdtY0oCoCQl4cydJcYzKscPOy5g7Z51W7Bqrzh1za08VBkIUwD

