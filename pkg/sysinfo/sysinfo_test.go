package sysinfo

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSystemInfo(t *testing.T) {
	log := logrus.New()
	log.SetLevel(logrus.DebugLevel)

	service := NewService(log)
	ctx := context.Background()

	info, err := service.GetSystemInfo(ctx)
	require.NoError(t, err)
	require.NotNil(t, info)

	// Basic checks
	assert.NotEmpty(t, info.Hostname)
	assert.NotEmpty(t, info.GoVersion)

	// Enhanced system info checks (when available)
	if runtime.GOOS == "linux" {
		// zcalusic/sysinfo works best on Linux
		assert.NotEmpty(t, info.OSName, "OS name should be available on Linux")
		assert.NotEmpty(t, info.CPUModel, "CPU model should be available on Linux")
		assert.Greater(t, info.TotalMemory, uint64(0), "Total memory should be greater than 0")
	}

	// Log all the info
	data, err := json.MarshalIndent(&info, "", "  ")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(string(data))
}
