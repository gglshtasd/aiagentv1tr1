// 3. Persist individual test result to database ONLY if not a dry run
      if (req.query.dryRun !== 'true') {
        await supabaseClient
          .from('model_registry')
          .update({
            is_available: isAvailable,
            failure_reason: failureReason,
            last_tested_at: new Date().toISOString()
          })
          .eq('model_id', model.model_id);
      }

      auditResults.push({
        model_id: model.model_id,
        status: isAvailable ? '✅ ONLINE' : '❌ OFFLINE',
        error: failureReason || 'OK'
      });
