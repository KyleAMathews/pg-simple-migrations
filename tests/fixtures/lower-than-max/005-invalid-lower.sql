-- This should fail as it's lower than the max migration number
CREATE TABLE invalid_lower (id SERIAL PRIMARY KEY);
