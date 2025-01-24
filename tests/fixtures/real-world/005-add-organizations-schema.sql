BEGIN;

-- Enable the citext extension if not already enabled
CREATE EXTENSION IF NOT EXISTS citext;

-- Core entities
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name CITEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Membership and roles
CREATE TABLE organization_members (
    organization_id UUID REFERENCES organizations(id),
    member_id UUID REFERENCES members(id),
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (organization_id, member_id)
);

-- Link to existing items table
CREATE TABLE organization_items (
    organization_id UUID REFERENCES organizations(id),
    item_id UUID REFERENCES items(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (organization_id, item_id)
);

-- Audit table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT NOT NULL,  -- 'organization', 'member', 'item'
    scope_id UUID NOT NULL,    
    actor_id UUID NOT NULL REFERENCES members(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    description TEXT,
    before_state JSONB,
    after_state JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_scope ON audit_logs (scope_type, scope_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);

-- Add updated_at triggers
CREATE TRIGGER set_timestamp_organizations
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_members
    BEFORE UPDATE ON members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_organization_members
    BEFORE UPDATE ON organization_members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_organization_items
    BEFORE UPDATE ON organization_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_audit_logs
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Create default organization and member
INSERT INTO organizations (id, name)
VALUES ('11111111-2222-3333-4444-555555555555', 'example-org');

INSERT INTO members (id, name, email)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'System Admin', 'admin@example.com');

-- Add audit log entry for organization creation
INSERT INTO audit_logs (
    scope_type,
    scope_id,
    actor_id,
    action,
    target_type,
    target_id,
    description,
    after_state
)
VALUES (
    'organization',
    '11111111-2222-3333-4444-555555555555',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'create',
    'organization',
    '11111111-2222-3333-4444-555555555555',
    'Created default organization example-org',
    jsonb_build_object(
        'name', 'example-org'
    )
);

-- Add audit log entry for member creation
INSERT INTO audit_logs (
    scope_type,
    scope_id,
    actor_id,
    action,
    target_type,
    target_id,
    description,
    after_state
)
VALUES (
    'member',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'create',
    'member',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'Created default member System Admin',
    jsonb_build_object(
        'name', 'System Admin',
        'email', 'admin@example.com'
    )
);

-- Add default member as admin to default organization
INSERT INTO organization_members (organization_id, member_id, role)
VALUES ('11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'admin');

-- Add audit log entry for organization membership
INSERT INTO audit_logs (
    scope_type,
    scope_id,
    actor_id,
    action,
    target_type,
    target_id,
    description,
    after_state
)
VALUES (
    'organization',
    '11111111-2222-3333-4444-555555555555',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'add_member',
    'member',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'Added System Admin as admin to example-org organization',
    jsonb_build_object(
        'role', 'admin'
    )
);

-- Associate all existing items with the default organization
INSERT INTO organization_items (organization_id, item_id)
SELECT '11111111-2222-3333-4444-555555555555', id
FROM items;

-- Add audit log entries for each item association
INSERT INTO audit_logs (
    scope_type,
    scope_id,
    actor_id,
    action,
    target_type,
    target_id,
    description,
    after_state
)
SELECT 
    'organization',
    '11111111-2222-3333-4444-555555555555',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'add_item',
    'item',
    id,
    'Associated existing items with example-org organization during migration',
    jsonb_build_object(
        'item_id', id,
        'organization_id', '11111111-2222-3333-4444-555555555555'
    )
FROM items;
