package consensus

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSlotDurationAt(t *testing.T) {
	t.Parallel()

	hezeSpec := map[string]any{
		"SECONDS_PER_SLOT":      "12",
		"SLOT_DURATION_MS":      "12000",
		"SLOT_DURATION_MS_HEZE": "9000",
		"HEZE_FORK_EPOCH":       "5",
		"SLOTS_PER_EPOCH":       "32",
	}

	tests := []struct {
		name     string
		spec     map[string]any
		slot     uint64
		expected time.Duration
		wantErr  bool
	}{
		{name: "pre heze", spec: hezeSpec, slot: 159, expected: 12 * time.Second},
		{name: "heze fork slot", spec: hezeSpec, slot: 160, expected: 9 * time.Second},
		{name: "post heze", spec: hezeSpec, slot: 10_000, expected: 9 * time.Second},
		{
			name: "heze far future",
			spec: map[string]any{
				"SLOT_DURATION_MS":      "12000",
				"SLOT_DURATION_MS_HEZE": "9000",
				"HEZE_FORK_EPOCH":       "18446744073709551615",
				"SLOTS_PER_EPOCH":       "32",
			},
			slot:     10_000,
			expected: 12 * time.Second,
		},
		{
			name: "heze absent",
			spec: map[string]any{
				"SLOT_DURATION_MS": "6000",
				"SLOTS_PER_EPOCH":  "32",
			},
			slot:     10_000,
			expected: 6 * time.Second,
		},
		{
			name:     "seconds per slot fallback",
			spec:     map[string]any{"SECONDS_PER_SLOT": "12"},
			slot:     10_000,
			expected: 12 * time.Second,
		},
		{name: "missing durations", spec: map[string]any{}, wantErr: true},
		{name: "zero duration", spec: map[string]any{"SLOT_DURATION_MS": "0"}, wantErr: true},
		{
			name: "missing slots per epoch",
			spec: map[string]any{
				"SLOT_DURATION_MS":      "12000",
				"SLOT_DURATION_MS_HEZE": "9000",
				"HEZE_FORK_EPOCH":       "5",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			duration, err := slotDurationAt(tt.spec, tt.slot)
			if tt.wantErr {
				require.ErrorIs(t, err, ErrInvalidSpec)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.expected, duration)
		})
	}
}

func TestGetSlotDuration(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/eth/v1/config/spec", r.URL.Path)
		_, _ = w.Write([]byte(`{"data":{
			"SECONDS_PER_SLOT":"12",
			"SLOT_DURATION_MS":"12000",
			"SLOT_DURATION_MS_HEZE":"9000",
			"HEZE_FORK_EPOCH":"5",
			"SLOTS_PER_EPOCH":"32",
			"DEPOSIT_CONTRACT_ADDRESS":"0x00000000219ab540356cbb839cbe05303d7705fa"
		}}`))
	}))
	defer server.Close()

	c := NewClient(logrus.New(), "cl", server.URL)

	duration, err := c.GetSlotDuration(context.Background(), 0)
	require.NoError(t, err)
	assert.Equal(t, 12*time.Second, duration)

	duration, err = c.GetSlotDuration(context.Background(), 160)
	require.NoError(t, err)
	assert.Equal(t, 9*time.Second, duration)
}
