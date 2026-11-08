        let currentPage='worldbook';
        let worldBookData={entries:{}};
        let activeUid=null;
        let exportVersion=1;
        let saveTimer=null;
        let isDirty=false;
        let selectMode=false;
        let selectedUids=new Set();
        let pendingImportData=null;
        let isFullscreen=false;
        let historyStack=[];
        let historyIndex=-1;
        const MAX_HISTORY=40;
        const WB_STORAGE_KEY='tavern_worldbook_editor_data';
        const WB_VERSION_KEY='tavern_worldbook_editor_version';

        // 预设状态
        let presetData=null;          // 完整原始对象，保留未知字段
        let presetVersion=1;
        let presetSaveTimer=null;
        let presetDirty=false;
        const PRESET_STORAGE_KEY='tavern_preset_editor_data';
        const PRESET_VERSION_KEY='tavern_preset_editor_version';
        let presetEnvelope=null;
        const PRESET_ENVELOPE_STORAGE_KEY='tavern_preset_editor_envelope';
        const PRESET_ARRAY_PATHS_KEY='tavern_preset_editor_array_paths';
        let presetArrayPaths={};
