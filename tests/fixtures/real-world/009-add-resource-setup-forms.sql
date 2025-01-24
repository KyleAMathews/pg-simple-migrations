CREATE TABLE resource_setup_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_for_member_id UUID REFERENCES members(id),
    deleted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    resource_id UUID REFERENCES resources(id),
    used_at TIMESTAMPTZ,
    location TEXT,
    instance TEXT
);
